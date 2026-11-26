import { Op } from "sequelize";
import User from "../models/user.js";
import Message from "../models/message.js";
import Group from "../models/group.js";
import GroupMember from "../models/groupMember.js";
import GroupMessageReceipt from "../models/groupMessageReceipt.js";
import { getIO, isUserOnline } from "../socket-io/index.js";
import { getPrivateRoomIdByEmail } from "../socket-io/handlers/personalChat.js";
import { getGroupRoomId } from "../socket-io/handlers/groupChat.js";
import { uploadFileToS3 } from "../config/s3.js";
import {
  generatePredictiveCompletions,
  generateSmartReplies,
} from "../services/geminiService.js";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function detectMediaCategory(mimetype = "") {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  return "file";
}

function parseDeletedUsers(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

function formatMessageForUser(msgObj, currentUserId) {
  const plain = msgObj.toJSON ? msgObj.toJSON() : { ...msgObj };
  if (plain.isDeletedForEveryone) {
    return {
      ...plain,
      content: "🚫 This message was deleted",
      mediaUrl: null,
      mediaType: null,
      fileName: null,
    };
  }
  return plain;
}

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
      where: { email },
      attributes: ["id", "name", "email"],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No registered user found with this email",
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

export const getUsersList = async (req, res, next) => {
  try {
    const search = (req.query.search || "").trim().toLowerCase();

    if (search) {
      const users = await User.findAll({
        where: {
          id: { [Op.ne]: req.user.id },
          [Op.or]: [
            { name: { [Op.like]: `%${search}%` } },
            { email: { [Op.like]: `%${search}%` } },
          ],
        },
        attributes: ["id", "name", "email"],
        order: [["name", "ASC"]],
      });

      return res.status(200).json({
        success: true,
        users,
      });
    }

    const recentMessages = await Message.findAll({
      where: {
        groupId: null,
        [Op.or]: [
          { senderId: req.user.id, receiverId: { [Op.ne]: null } },
          { receiverId: req.user.id },
        ],
      },
      include: [
        { model: User, as: "sender", attributes: ["id", "name", "email"] },
        { model: User, as: "receiver", attributes: ["id", "name", "email"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    const contactMap = new Map();

    for (const msg of recentMessages) {
      const deletedFor = parseDeletedUsers(msg.deletedForUserIds);
      if (deletedFor.includes(Number(req.user.id))) continue;

      const isOutgoing = msg.senderId === req.user.id;
      const partner = isOutgoing ? msg.receiver : msg.sender;
      if (!partner) continue;

      const previewText = msg.isDeletedForEveryone
        ? "🚫 Message deleted"
        : msg.content || `📎 ${msg.fileName || "Attachment"}`;

      if (!contactMap.has(partner.id)) {
        contactMap.set(partner.id, {
          id: partner.id,
          name: partner.name,
          email: partner.email,
          unreadCount: 0,
          lastMessage: previewText,
          lastMessageTime: msg.createdAt,
        });
      }

      if (!isOutgoing && !msg.isRead && !msg.isDeletedForEveryone) {
        const entry = contactMap.get(partner.id);
        entry.unreadCount += 1;
      }
    }

    res.status(200).json({
      success: true,
      users: Array.from(contactMap.values()),
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

    const normalizedEmails = [
      ...new Set(
        memberEmails
          .map((e) => String(e).trim().toLowerCase())
          .filter((e) => e && e !== req.user.email.toLowerCase())
      ),
    ];

    const matchedUsers =
      normalizedEmails.length > 0
        ? await User.findAll({
            where: { email: { [Op.in]: normalizedEmails } },
            attributes: ["id", "name", "email"],
          })
        : [];

    const group = await Group.create({
      name,
      createdBy: req.user.id,
    });

    const memberIds = [req.user.id, ...matchedUsers.map((u) => u.id)];
    await GroupMember.bulkCreate(
      memberIds.map((userId) => ({
        groupId: group.id,
        userId,
      }))
    );

    const groupPayload = {
      id: group.id,
      name: group.name,
      createdBy: group.createdBy,
      memberCount: memberIds.length,
      members: [
        { id: req.user.id, name: req.user.name, email: req.user.email },
        ...matchedUsers,
      ],
    };

    const io = getIO();
    memberIds.forEach((uid) => {
      io.to(`user_${uid}`).emit("group_created", groupPayload);
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
    const myMemberships = await GroupMember.findAll({
      where: { userId: req.user.id },
      attributes: ["groupId"],
    });

    const groupIds = myMemberships.map((m) => m.groupId);
    if (groupIds.length === 0) {
      return res.status(200).json({
        success: true,
        groups: [],
      });
    }

    const groupRecords = await Group.findAll({
      where: { id: { [Op.in]: groupIds } },
      order: [["createdAt", "DESC"]],
    });

    const allMemberships = await GroupMember.findAll({
      where: { groupId: { [Op.in]: groupIds } },
      attributes: ["groupId", "userId"],
    });

    const allUserIds = [...new Set(allMemberships.map((m) => m.userId))];
    const users = await User.findAll({
      where: { id: { [Op.in]: allUserIds } },
      attributes: ["id", "name", "email"],
    });
    const userMap = new Map(users.map((u) => [u.id, u.toJSON()]));

    const groups = groupRecords.map((g) => {
      const members = allMemberships
        .filter((m) => Number(m.groupId) === Number(g.id))
        .map((m) => userMap.get(m.userId))
        .filter(Boolean);

      return {
        id: g.id,
        name: g.name,
        createdBy: g.createdBy,
        memberCount: members.length,
        members,
      };
    });

    res.status(200).json({
      success: true,
      groups,
    });
  } catch (error) {
    next(error);
  }
};

export const removeGroupMember = async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const targetUserId = Number(req.params.userId);

    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    if (Number(group.createdBy) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Only the group admin can remove members",
      });
    }

    if (targetUserId === Number(group.createdBy)) {
      return res.status(400).json({
        success: false,
        message: "Group admin cannot be removed",
      });
    }

    const deletedCount = await GroupMember.destroy({
      where: { groupId, userId: targetUserId },
    });

    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Member not found in this group",
      });
    }

    const io = getIO();
    io.to(getGroupRoomId(groupId)).emit("group_member_removed", {
      groupId,
      removedUserId: targetUserId,
    });
    io.to(`user_${targetUserId}`).emit("group_member_removed", {
      groupId,
      removedUserId: targetUserId,
    });

    res.status(200).json({
      success: true,
      groupId,
      removedUserId: targetUserId,
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
    const clientTempId = req.body.clientTempId || null;
    const uploadedFile = req.file || null;

    if (!content && !uploadedFile) {
      return res.status(400).json({
        success: false,
        message: "Message content or media file is required",
      });
    }

    const io = getIO();
    let receiverOnline = false;
    let targetUser = null;
    let otherGroupMembers = [];

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
      const members = await GroupMember.findAll({
        where: { groupId },
        attributes: ["userId"],
      });
      const isMember = members.some((m) => m.userId === req.user.id);
      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this group",
        });
      }
      otherGroupMembers = members
        .map((m) => m.userId)
        .filter((uid) => uid !== req.user.id);
    }

    let mediaUrl = null;
    let mediaType = null;
    let fileName = null;

    if (uploadedFile) {
      const s3Result = await uploadFileToS3(uploadedFile);
      mediaUrl = s3Result.fileUrl;
      mediaType = detectMediaCategory(s3Result.mimeType);
      fileName = s3Result.fileName;
    }

    let initialDelivered = receiverOnline;
    if (groupId) {
      initialDelivered =
        otherGroupMembers.length > 0 &&
        otherGroupMembers.every((uid) => isUserOnline(io, uid));
    }

    const newMessage = await Message.create({
      senderId: req.user.id,
      receiverId: groupId ? null : receiverId,
      groupId: groupId || null,
      content,
      mediaUrl,
      mediaType,
      fileName,
      isDelivered: initialDelivered,
      isRead: false,
    });

    if (groupId && otherGroupMembers.length > 0) {
      await GroupMessageReceipt.bulkCreate(
        otherGroupMembers.map((uid) => ({
          messageId: newMessage.id,
          groupId,
          userId: uid,
          isDelivered: isUserOnline(io, uid),
          isRead: false,
        }))
      );
    }

    const fullMessageRecord = await Message.findByPk(newMessage.id, {
      attributes: [
        "id",
        "senderId",
        "receiverId",
        "groupId",
        "content",
        "mediaUrl",
        "mediaType",
        "fileName",
        "isDelivered",
        "isRead",
        "isDeletedForEveryone",
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

    const payload = {
      ...fullMessageRecord.toJSON(),
      clientTempId,
    };

    if (groupId) {
      io.to(getGroupRoomId(groupId)).emit("new_message", payload);
    } else if (receiverId && targetUser) {
      const roomName = getPrivateRoomIdByEmail(
        req.user.email,
        targetUser.email
      );
      io.to(roomName).emit("new_message", payload);
      io.to(`user_${receiverId}`).emit("contact_updated", payload);
    } else {
      io.to("global_group").emit("new_message", payload);
    }

    res.status(201).json({
      success: true,
      message: payload,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteMessage = async (req, res, next) => {
  try {
    const messageId = Number(req.params.messageId);
    const mode = req.body.mode === "everyone" ? "everyone" : "me";

    const message = await Message.findByPk(messageId, {
      include: [
        { model: User, as: "sender", attributes: ["id", "email"] },
        { model: User, as: "receiver", attributes: ["id", "email"] },
      ],
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    if (mode === "me") {
      const deletedFor = parseDeletedUsers(message.deletedForUserIds);
      if (!deletedFor.includes(Number(req.user.id))) {
        deletedFor.push(Number(req.user.id));
        message.deletedForUserIds = JSON.stringify(deletedFor);
        await message.save();
      }
      return res.status(200).json({
        success: true,
        mode: "me",
        messageId,
      });
    }

    if (Number(message.senderId) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own messages for everyone",
      });
    }

    const ageMs = Date.now() - new Date(message.createdAt).getTime();
    if (ageMs > FIFTEEN_MINUTES_MS) {
      return res.status(400).json({
        success: false,
        message:
          "Delete for everyone is only available within 15 minutes of sending",
      });
    }

    message.isDeletedForEveryone = true;
    message.content = "";
    message.mediaUrl = null;
    message.mediaType = null;
    message.fileName = null;
    await message.save();

    const io = getIO();
    const deleteEventPayload = {
      messageId: message.id,
      groupId: message.groupId,
      senderId: message.senderId,
      receiverId: message.receiverId,
    };

    if (message.groupId) {
      io.to(getGroupRoomId(message.groupId)).emit(
        "message_deleted_everyone",
        deleteEventPayload
      );
    } else if (message.receiverId && message.sender && message.receiver) {
      const roomName = getPrivateRoomIdByEmail(
        message.sender.email,
        message.receiver.email
      );
      io.to(roomName).emit("message_deleted_everyone", deleteEventPayload);
    } else {
      io.to("global_group").emit(
        "message_deleted_everyone",
        deleteEventPayload
      );
    }

    res.status(200).json({
      success: true,
      mode: "everyone",
      messageId: message.id,
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

    const records = await Message.findAll({
      where: whereClause,
      attributes: [
        "id",
        "senderId",
        "receiverId",
        "groupId",
        "content",
        "mediaUrl",
        "mediaType",
        "fileName",
        "isDelivered",
        "isRead",
        "isDeletedForEveryone",
        "deletedForUserIds",
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

    const visibleMessages = records
      .filter((m) => {
        const deletedFor = parseDeletedUsers(m.deletedForUserIds);
        return !deletedFor.includes(Number(req.user.id));
      })
      .map((m) => formatMessageForUser(m, req.user.id));

    res.status(200).json({
      success: true,
      messages: visibleMessages,
    });
  } catch (error) {
    next(error);
  }
};

export const getAiSmartReplies = async (req, res, next) => {
  try {
    const recentContext = Array.isArray(req.body.recentContext)
      ? req.body.recentContext
      : [];
    const userStyle =
      req.body.userStyle || "friendly, natural, concise with light emojis";

    const replies = await generateSmartReplies({
      recentContext,
      userStyle,
    });

    res.status(200).json({
      success: true,
      replies,
    });
  } catch (error) {
    next(error);
  }
};

export const getAiPredictiveTyping = async (req, res, next) => {
  try {
    const partialText = String(req.body.partialText || "");
    const recentContext = Array.isArray(req.body.recentContext)
      ? req.body.recentContext
      : [];
    const userStyle =
      req.body.userStyle || "friendly, natural, concise with light emojis";

    const suggestions = await generatePredictiveCompletions({
      partialText,
      recentContext,
      userStyle,
    });

    res.status(200).json({
      success: true,
      suggestions,
    });
  } catch (error) {
    next(error);
  }
};
