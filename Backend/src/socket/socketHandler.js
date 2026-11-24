import { Server } from "socket.io";
import Message from "../models/message.js";
import User from "../models/user.js";
import { authenticateSocket } from "../middleware/socketAuthMiddleware.js";

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const { id, name, email } = socket.user;
    console.log(
      `Authenticated socket connected: ${name} (ID: ${id}, Email: ${email})`
    );

    socket.join("global_group");
    socket.join(`user_${id}`);

    socket.emit("authenticated", {
      user: socket.user,
    });

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
      console.log(`Authenticated socket disconnected: ${name} (ID: ${id})`);
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
