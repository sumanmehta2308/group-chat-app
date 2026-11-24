import Message from "../../models/message.js";
import User from "../../models/user.js";

export const getPrivateRoomId = (userId1, userId2) => {
  const first = Math.min(Number(userId1), Number(userId2));
  const second = Math.max(Number(userId1), Number(userId2));
  return `private_${first}_${second}`;
};

export const registerPersonalChatHandlers = (io, socket) => {
  const { id, name } = socket.user;

  socket.on("join_room", ({ targetUserId }) => {
    if (!targetUserId) return;
    const roomId = getPrivateRoomId(id, targetUserId);
    socket.join(roomId);
    socket.emit("room_joined", {
      roomId,
      targetUserId: Number(targetUserId),
    });
  });

  socket.on("new_message", async ({ receiverId, content }) => {
    try {
      const trimmed = (content || "").trim();
      if (!trimmed || !receiverId) return;

      const targetId = Number(receiverId);
      const roomId = getPrivateRoomId(id, targetId);

      const newMessage = await Message.create({
        senderId: id,
        receiverId: targetId,
        content: trimmed,
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

      io.to(roomId).emit("new_message", fullMessage);
    } catch (error) {
      console.error("Personal chat error:", error.message);
    }
  });

  socket.on("private_typing", ({ targetUserId }) => {
    if (!targetUserId) return;
    const roomId = getPrivateRoomId(id, targetUserId);
    socket.to(roomId).emit("user_typing", {
      userId: id,
      name,
      isPrivate: true,
    });
  });

  socket.on("private_stop_typing", ({ targetUserId }) => {
    if (!targetUserId) return;
    const roomId = getPrivateRoomId(id, targetUserId);
    socket.to(roomId).emit("user_stop_typing", {
      userId: id,
      isPrivate: true,
    });
  });
};
