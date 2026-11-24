import Message from "../../models/message.js";
import User from "../../models/user.js";

export const getPrivateRoomId = (userId1, userId2) => {
  const first = Math.min(Number(userId1), Number(userId2));
  const second = Math.max(Number(userId1), Number(userId2));
  return `private_${first}_${second}`;
};

export const isUserOnline = (io, userId) => {
  const room = io.sockets.adapter.rooms.get(`user_${Number(userId)}`);
  return Boolean(room && room.size > 0);
};

export const registerPersonalChatHandlers = async (io, socket) => {
  const { id, name } = socket.user;

  try {
    const pendingMessages = await Message.findAll({
      where: { receiverId: id, isDelivered: false },
      attributes: ["id", "senderId"],
    });

    if (pendingMessages.length > 0) {
      await Message.update(
        { isDelivered: true },
        { where: { receiverId: id, isDelivered: false } }
      );

      const senderIds = [...new Set(pendingMessages.map((m) => m.senderId))];
      senderIds.forEach((senderId) => {
        const roomId = getPrivateRoomId(senderId, id);
        io.to(roomId).emit("messages_delivered", { roomId, receiverId: id });
      });
    }
  } catch (error) {
    console.error("Delivery sync error:", error.message);
  }

  socket.on("join_room", ({ roomId, targetUserId }) => {
    const resolvedRoomId =
      roomId || (targetUserId ? getPrivateRoomId(id, targetUserId) : null);
    if (!resolvedRoomId) return;

    socket.join(resolvedRoomId);
    socket.emit("room_joined", {
      roomId: resolvedRoomId,
      targetUserId: targetUserId ? Number(targetUserId) : null,
      isOnline: targetUserId ? isUserOnline(io, targetUserId) : false,
    });
  });

  socket.on("leave_room", ({ roomId }) => {
    if (!roomId || roomId === "global_group") return;
    socket.leave(roomId);
  });

  socket.on("mark_as_read", async ({ roomId, senderId }) => {
    try {
      if (!senderId) return;
      const targetSenderId = Number(senderId);
      const resolvedRoomId = roomId || getPrivateRoomId(id, targetSenderId);

      const [updatedCount] = await Message.update(
        { isDelivered: true, isRead: true },
        {
          where: {
            senderId: targetSenderId,
            receiverId: id,
            isRead: false,
          },
        }
      );

      if (updatedCount > 0) {
        io.to(resolvedRoomId).emit("messages_read", {
          roomId: resolvedRoomId,
          readerId: id,
        });
        io.to(`user_${targetSenderId}`).emit("messages_read", {
          roomId: resolvedRoomId,
          readerId: id,
        });
      }
    } catch (error) {
      console.error("Mark as read error:", error.message);
    }
  });

  socket.on("new_message", async ({ roomId, receiverId, content }) => {
    try {
      const trimmed = (content || "").trim();
      if (!trimmed || !receiverId) return;

      const targetId = Number(receiverId);
      const resolvedRoomId = roomId || getPrivateRoomId(id, targetId);
      const receiverOnline = isUserOnline(io, targetId);

      const newMessage = await Message.create({
        senderId: id,
        receiverId: targetId,
        content: trimmed,
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

      io.to(resolvedRoomId).emit("new_message", fullMessage);
      io.to(`user_${targetId}`).emit("contact_updated", fullMessage);
    } catch (error) {
      console.error("Personal chat error:", error.message);
    }
  });

  socket.on("private_typing", ({ roomId, targetUserId }) => {
    const resolvedRoomId =
      roomId || (targetUserId ? getPrivateRoomId(id, targetUserId) : null);
    if (!resolvedRoomId) return;

    socket.to(resolvedRoomId).emit("user_typing", {
      userId: id,
      name,
      isPrivate: true,
    });
  });

  socket.on("private_stop_typing", ({ roomId, targetUserId }) => {
    const resolvedRoomId =
      roomId || (targetUserId ? getPrivateRoomId(id, targetUserId) : null);
    if (!resolvedRoomId) return;

    socket.to(resolvedRoomId).emit("user_stop_typing", {
      userId: id,
      isPrivate: true,
    });
  });
};
