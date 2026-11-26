import { Server } from "socket.io";
import { socketAuthMiddleware } from "./middleware.js";
import { registerChatHandlers } from "./handlers/chat.js";
import { registerPersonalChatHandlers } from "./handlers/personalChat.js";
import { registerGroupChatHandlers } from "./handlers/groupChat.js";

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

  io.on("connection", async (socket) => {
    const { id, name, email } = socket.user;
    console.log(
      `Authenticated socket connected: ${name} (ID: ${id}, Email: ${email})`
    );

    registerChatHandlers(io, socket);
    await registerPersonalChatHandlers(io, socket);
    await registerGroupChatHandlers(io, socket);

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
export const isUserOnline = (ioInstance, userId) => {
  const activeIo = ioInstance || io;
  if (!activeIo || !userId) return false;
  const userRoom = activeIo.sockets.adapter.rooms.get(`user_${Number(userId)}`);
  return Boolean(userRoom && userRoom.size > 0);
};