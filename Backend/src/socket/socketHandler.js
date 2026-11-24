import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Message from "../models/message.js";
let io;
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error("Authentication token missing"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id, {
        attributes: ["id", "name", "email"],
      });

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = user;
      next();
    } catch {
      next(new Error("Invalid or expired socket token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.id})`);
    socket.join("global_group");

    socket.on("send_message", async (data) => {
      try {
        const content = (data?.content || "").trim();
        if (!content) return;

        const newMessage = await Message.create({
          senderId: socket.user.id,
          content,
        });

        const fullMessage = await Message.findByPk(newMessage.id, {
          attributes: ["id", "senderId", "content", "createdAt"],
          include: [
            {
              model: User,
              as: "sender",
              attributes: ["id", "name", "email"],
            },
          ],
        });

        io.to("global_group").emit("new_message", fullMessage);
      } catch (error) {
        console.error("Socket message error:", error.message);
      }
    });

    socket.on("typing", () => {
      socket.to("global_group").emit("user_typing", {
        userId: socket.user.id,
        name: socket.user.name,
      });
    });

    socket.on("stop_typing", () => {
      socket.to("global_group").emit("user_stop_typing", {
        userId: socket.user.id,
      });
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.user.name} (${socket.id})`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};
