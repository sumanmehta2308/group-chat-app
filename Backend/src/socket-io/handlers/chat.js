import Message from "../../models/message.js";
import User from "../../models/user.js";

export const registerChatHandlers = (io, socket) => {
  const { id, name } = socket.user;

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
        senderId: id,
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
      userId: id,
      name,
    });
  });

  socket.on("stop_typing", () => {
    socket.to("global_group").emit("user_stop_typing", {
      userId: id,
    });
  });
};
