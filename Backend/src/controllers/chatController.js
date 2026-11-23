import Message from "../models/message.js";
import User from "../models/user.js";

export const sendMessage = async (req, res, next) => {
  try {
    const content = (req.body.content || "").trim();

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Message content cannot be empty",
      });
    }

    const newMessage = await Message.create({
      senderId: req.user.id,
      content,
    });

    const fullMessage = await Message.findByPk(newMessage.id, {
      include: [
        {
          model: User,
          as: "sender",
          attributes: ["id", "name", "email"],
        },
      ],
    });

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
    const messages = await Message.findAll({
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
