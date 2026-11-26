import Message from "../../models/message.js";
import User from "../../models/user.js";

export const getPrivateRoomIdByEmail = (email1, email2) => {
  const sorted = [
    String(email1).trim().toLowerCase(),
    String(email2).trim().toLowerCase(),
  ].sort();
  return `private_${sorted[0]}_${sorted[1]}`;
};

export const isUserOnline = (io, userId) => {
  const room = io.sockets.adapter.rooms.get(`user_${Number(userId)}`);
  return Boolean(room && room.size > 0);
};

export const registerPersonalChatHandlers = async (io, socket) => {
  const { id, name, email } = socket.user;

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
      const senders = await User.findAll({
        where: { id: senderIds },
        attributes: ["id", "email"],
      });

      senders.forEach((sender) => {
        const roomId = getPrivateRoomIdByEmail(sender.email, email);
        io.to(roomId).emit("messages_delivered", { roomId, receiverId: id });
      });
    }
  } catch (error) {
    console.error("Delivery sync error:", error.message);
  }

  socket.on("join_room", async ({ roomId, targetEmail }) => {
    try {
      let resolvedRoomId = roomId;

      if (targetEmail) {
        const targetUser = await User.findOne({
          where: {
            email: String(targetEmail).trim().toLowerCase(),
            isVerified: true,
          },
          attributes: ["id", "name", "email"],
        });

        if (!targetUser || targetUser.id === id) {
          socket.emit("room_error", {
            message: "No verified user found with this email address.",
          });
          return;
        }

        resolvedRoomId = getPrivateRoomIdByEmail(email, targetUser.email);
      }

      if (!resolvedRoomId) return;

      socket.join(resolvedRoomId);
      socket.emit("room_joined", {
        roomId: resolvedRoomId,
      });
    } catch (error) {
      socket.emit("room_error", { message: "Failed to join room" });
    }
  });

  socket.on("leave_room", ({ roomId }) => {
    if (!roomId || roomId === "global_group") return;
    socket.leave(roomId);
  });

  socket.on("mark_as_read", async ({ roomId, senderId }) => {
    try {
      if (!senderId) return;
      const targetSenderId = Number(senderId);

      const senderUser = await User.findByPk(targetSenderId, {
        attributes: ["id", "email"],
      });
      if (!senderUser) return;

      const resolvedRoomId =
        roomId || getPrivateRoomIdByEmail(email, senderUser.email);

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

      const targetUser = await User.findByPk(Number(receiverId), {
        attributes: ["id", "email"],
      });
      if (!targetUser) return;

      const resolvedRoomId =
        roomId || getPrivateRoomIdByEmail(email, targetUser.email);
      const receiverOnline = isUserOnline(io, targetUser.id);

      const newMessage = await Message.create({
        senderId: id,
        receiverId: targetUser.id,
        groupId: null,
        content: trimmed,
        isDelivered: receiverOnline,
        isRead: false,
      });

      const fullMessage = await Message.findByPk(newMessage.id, {
        attributes: [
          "id",
          "senderId",
          "receiverId",
          "groupId",
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
      io.to(`user_${targetUser.id}`).emit("contact_updated", fullMessage);
    } catch (error) {
      console.error("Personal chat error:", error.message);
    }
  });

  socket.on("private_typing", ({ roomId }) => {
    if (!roomId) return;
    socket.to(roomId).emit("user_typing", {
      userId: id,
      name,
      roomId,
      isPrivate: true,
    });
  });

  socket.on("private_stop_typing", ({ roomId }) => {
    if (!roomId) return;
    socket.to(roomId).emit("user_stop_typing", {
      userId: id,
      roomId,
      isPrivate: true,
    });
  });
};
