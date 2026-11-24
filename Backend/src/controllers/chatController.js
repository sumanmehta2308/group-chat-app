import { Op } from "sequelize";
import Message from "../models/message.js";
import User from "../models/user.js";
import { getIO } from "../socket-io/index.js";
import {
  getPrivateRoomId,
  isUserOnline,
} from "../socket-io/handlers/personalChat.js";

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

export const sendMessage = async (req, res, next) => {
  try {
    const content = (req.body.content || "").trim();
    const receiverId = req.body.receiverId ? Number(req.body.receiverId) : null;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Message content cannot be empty",
      });
    }

    const io = getIO();
    const receiverOnline = receiverId ? isUserOnline(io, receiverId) : false;

    const newMessage = await Message.create({
      senderId: req.user.id,
      receiverId,
      content,
      isDelivered: receiverOnline,
      isRead: false,
    });

    const fullMessage = await Message.findByPk(newMessage.id, {
      attributes: [
        "id",
        "senderId",
        "receiverId",
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

    if (receiverId) {
      const roomName = getPrivateRoomId(req.user.id, receiverId);
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

    const whereClause = targetUserId
      ? {
          [Op.or]: [
            { senderId: req.user.id, receiverId: targetUserId },
            { senderId: targetUserId, receiverId: req.user.id },
          ],
        }
      : {
          receiverId: null,
        };

    const messages = await Message.findAll({
      where: whereClause,
      attributes: [
        "id",
        "senderId",
        "receiverId",
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
