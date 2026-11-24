import { Op } from "sequelize";
import Message from "../models/message.js";
import User from "../models/user.js";
import { getIO } from "../socket-io/index.js";

export const getUsersList = async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: {
        id: { [Op.ne]: req.user.id },
        isVerified: true,
      },
      attributes: ["id", "name", "email"],
      order: [["name", "ASC"]],
    });

    res.status(200).json({
      success: true,
      users,
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

    const newMessage = await Message.create({
      senderId: req.user.id,
      receiverId,
      content,
    });

    const fullMessage = await Message.findByPk(newMessage.id, {
      attributes: ["id", "senderId", "receiverId", "content", "createdAt"],
      include: [
        {
          model: User,
          as: "sender",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    const io = getIO();
    if (receiverId) {
      const roomName = `private_${Math.min(req.user.id, receiverId)}_${Math.max(
        req.user.id,
        receiverId
      )}`;
      io.to(roomName).emit("new_message", fullMessage);
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
      attributes: ["id", "senderId", "receiverId", "content", "createdAt"],
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
