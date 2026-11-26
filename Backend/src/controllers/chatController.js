import { Op } from "sequelize";
import Message from "../models/message.js";
import User from "../models/user.js";
import Group from "../models/group.js";
import GroupMember from "../models/groupMember.js";
import { getIO } from "../socket-io/index.js";
import {
  getPrivateRoomIdByEmail,
  isUserOnline,
} from "../socket-io/handlers/personalChat.js";
import { getGroupRoomId } from "../socket-io/handlers/groupChat.js";

export const verifyUserByEmail = async (req, res, next) => {
  try {
    const email = (req.query.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    if (email === req.user.email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "You cannot start a private chat with yourself",
      });
    }

    const user = await User.findOne({
      where: {
        email,
        isVerified: true,
      },
      attributes: ["id", "name", "email"],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No verified user registered with this email",
      });
    }

    const roomId = getPrivateRoomIdByEmail(req.user.email, user.email);

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      roomId,
    });
  } catch (error) {
    next(error);
  }
};

export const getUsersList = async (req, res, next) => {
  try {
    const search = (req.query.search || "").trim().toLowerCase();

    if (search) {
      if (search.length < 3) {
        return res.status(200).json({
          success: true,
          users: [],
        });
      }

      const users = await User.findAll({
        where: {
          id: { [Op.ne]: req.user.id },
          isVerified: true,
          [Op.or]: [
            { email: { [Op.like]: `%${search}%` } },
            { name: { [Op.like]: `%${search}%` } },
          ],
        },
        attributes: ["id", "name", "email"],
        limit: 10,
        order: [["name", "ASC"]],
      });

      const formattedSearchUsers = users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        unreadCount: 0,
        lastMessage: u.email,
        lastMessageTime: null,
      }));

      return res.status(200).json({
        success: true,
        users: formattedSearchUsers,
      });
    }

    const recentMessages = await Message.findAll({
      where: {
        receiverId: { [Op.ne]: null },
        groupId: null,
        [Op.or]: [{ senderId: req.user.id }, { receiverId: req.user.id }],
      },
      attributes: [
        "id",
        "senderId",
        "receiverId",
        "content",
        "isRead",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    const contactIds = [];
    const contactMeta = new Map();

    for (const msg of recentMessages) {
      const otherId =
        msg.senderId === req.user.id ? msg.receiverId : msg.senderId;
      if (!otherId) continue;

      if (!contactMeta.has(otherId)) {
        contactIds.push(otherId);
        contactMeta.set(otherId, {
          unreadCount: 0,
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
        });
      }

      if (msg.receiverId === req.user.id && !msg.isRead) {
        const current = contactMeta.get(otherId);
        current.unreadCount += 1;
      }
    }

    if (contactIds.length === 0) {
      return res.status(200).json({
        success: true,
        users: [],
      });
    }

    const users = await User.findAll({
      where: {
        id: { [Op.in]: contactIds },
        isVerified: true,
      },
      attributes: ["id", "name", "email"],
    });

    const orderedUsers = contactIds
      .map((id) => {
        const userObj = users.find((u) => u.id === id);
        if (!userObj) return null;
        const meta = contactMeta.get(id);
        return {
          id: userObj.id,
          name: userObj.name,
          email: userObj.email,
          unreadCount: meta.unreadCount,
          lastMessage: meta.lastMessage,
          lastMessageTime: meta.lastMessageTime,
        };
      })
      .filter(Boolean);

    res.status(200).json({
      success: true,
      users: orderedUsers,
    });
  } catch (error) {
    next(error);
  }
};

export const createGroup = async (req, res, next) => {
  try {
    const name = (req.body.name || "").trim();
    const memberEmails = Array.isArray(req.body.memberEmails)
      ? req.body.memberEmails
      : [];

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Group name is required",
      });
    }

    const cleanEmails = [
      ...new Set(
        memberEmails
          .map((e) => String(e).trim().toLowerCase())
          .filter((e) => e && e !== req.user.email.toLowerCase())
      ),
    ];

    const matchedUsers = cleanEmails.length
      ? await User.findAll({
          where: {
            email: { [Op.in]: cleanEmails },
            isVerified: true,
          },
          attributes: ["id", "name", "email"],
        })
      : [];

    const group = await Group.create({
      name,
      createdBy: req.user.id,
    });

    const allMemberIds = [req.user.id, ...matchedUsers.map((u) => u.id)];

    await GroupMember.bulkCreate(
      allMemberIds.map((userId) => ({
        groupId: group.id,
        userId,
      })),
      { ignoreDuplicates: true }
    );

    const groupPayload = {
      id: group.id,
      name: group.name,
      createdBy: group.createdBy,
      memberCount: allMemberIds.length,
      members: [
        { id: req.user.id, name: req.user.name, email: req.user.email },
        ...matchedUsers,
      ],
    };

    const io = getIO();
    allMemberIds.forEach((memberId) => {
      io.to(`user_${memberId}`).emit("group_created", groupPayload);
    });

    res.status(201).json({
      success: true,
      group: groupPayload,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserGroups = async (req, res, next) => {
  try {
    const memberships = await GroupMember.findAll({
      where: { userId: req.user.id },
      include: [
        {
          model: Group,
          as: "group",
          attributes: ["id", "name", "createdBy", "createdAt"],
          include: [
            {
              model: User,
              as: "members",
              attributes: ["id", "name", "email"],
              through: { attributes: [] },
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const groups = memberships
      .map((m) => m.group)
      .filter(Boolean)
      .map((g) => ({
        id: g.id,
        name: g.name,
        createdBy: g.createdBy,
        memberCount: g.members ? g.members.length : 1,
        members: g.members || [],
      }));

    res.status(200).json({
      success: true,
      groups,
    });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const content = (req.body.content || "").trim();
    const receiverId = req.body.receiverId ? Number(req.body.receiverId) : null;
    const groupId = req.body.groupId ? Number(req.body.groupId) : null;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Message content cannot be empty",
      });
    }

    const io = getIO();
    let receiverOnline = false;
    let targetUser = null;

    if (receiverId) {
      targetUser = await User.findByPk(receiverId, {
        attributes: ["id", "email"],
      });
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "Recipient user not found",
        });
      }
      receiverOnline = isUserOnline(io, receiverId);
    }

    if (groupId) {
      const membership = await GroupMember.findOne({
        where: { groupId, userId: req.user.id },
      });
      if (!membership) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this group",
        });
      }
    }

    const newMessage = await Message.create({
      senderId: req.user.id,
      receiverId: groupId ? null : receiverId,
      groupId: groupId || null,
      content,
      isDelivered: receiverOnline,
      isRead: false,
    });

    const fullMessage = await Message.findByPk(newMessage.id, {
      attributes: [
        "id",
        "senderId",
        "receiverId",
        "groupId",
        "content",
        "isDelivered",
        "isRead",
        "createdAt",
      ],
      include: [
        {
          model: User,
          as: "sender",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (groupId) {
      io.to(getGroupRoomId(groupId)).emit("new_message", fullMessage);
    } else if (receiverId && targetUser) {
      const roomName = getPrivateRoomIdByEmail(
        req.user.email,
        targetUser.email
      );
      io.to(roomName).emit("new_message", fullMessage);
      io.to(`user_${receiverId}`).emit("contact_updated", fullMessage);
    } else {
      io.to("global_group").emit("new_message", fullMessage);
    }

    res.status(201).json({
      success: true,
      message: fullMessage,
    });
  } catch (error) {
    next(error);
  }
};

export const getMessages = async (req, res, next) => {
  try {
    const targetUserId = req.query.userId ? Number(req.query.userId) : null;
    const groupId = req.query.groupId ? Number(req.query.groupId) : null;

    let whereClause;

    if (groupId) {
      const membership = await GroupMember.findOne({
        where: { groupId, userId: req.user.id },
      });
      if (!membership) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this group",
        });
      }
      whereClause = { groupId };
    } else if (targetUserId) {
      whereClause = {
        groupId: null,
        [Op.or]: [
          { senderId: req.user.id, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: req.user.id },
        ],
      };
    } else {
      whereClause = {
        receiverId: null,
        groupId: null,
      };
    }

    const messages = await Message.findAll({
      where: whereClause,
      attributes: [
        "id",
        "senderId",
        "receiverId",
        "groupId",
        "content",
        "isDelivered",
        "isRead",
        "createdAt",
      ],
      include: [
        {
          model: User,
          as: "sender",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    next(error);
  }
};
