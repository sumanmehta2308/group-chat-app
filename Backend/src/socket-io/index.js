import { Server } from "socket.io";
import { socketAuthMiddleware } from "./middleware.js";
import { registerChatHandlers } from "./handlers/chat.js";
import { registerPersonalChatHandlers } from "./handlers/personalChat.js";

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    const { id, name, email } = socket.user;
    console.log(
      `Authenticated socket connected: ${name} (ID: ${id}, Email: ${email})`
    );

    registerChatHandlers(io, socket);
    registerPersonalChatHandlers(io, socket);

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
