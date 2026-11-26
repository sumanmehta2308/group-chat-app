import { Op } from "sequelize";
import GroupMember from "../../models/groupMember.js";
import GroupMessageReceipt from "../../models/groupMessageReceipt.js";
import Message from "../../models/message.js";

export const getGroupRoomId = (groupId) => `group_${Number(groupId)}`;

export const syncGroupMessageAggregateStatus = async (
  io,
  messageId,
  groupId
) => {
  const receipts = await GroupMessageReceipt.findAll({
    where: { messageId: Number(messageId) },
    attributes: ["isDelivered", "isRead"],
  });

  if (receipts.length === 0) return;

  const allDelivered = receipts.every((r) => r.isDelivered);
  const allRead = receipts.every((r) => r.isRead);

  if (allDelivered || allRead) {
    await Message.update(
      {
        isDelivered: allDelivered,
        isRead: allRead,
      },
      { where: { id: Number(messageId) } }
    );

    io.to(getGroupRoomId(groupId)).emit("group_message_status_updated", {
      messageId: Number(messageId),
      groupId: Number(groupId),
      isDelivered: allDelivered,
      isRead: allRead,
    });
  }
};

export const registerGroupChatHandlers = async (io, socket) => {
  const { id, name } = socket.user;

  try {
    const memberships = await GroupMember.findAll({
      where: { userId: id },
      attributes: ["groupId"],
    });

    memberships.forEach((m) => {
      socket.join(getGroupRoomId(m.groupId));
    });

    const pendingGroupReceipts = await GroupMessageReceipt.findAll({
      where: { userId: id, isDelivered: false },
      attributes: ["messageId", "groupId"],
    });

    if (pendingGroupReceipts.length > 0) {
      await GroupMessageReceipt.update(
        { isDelivered: true },
        { where: { userId: id, isDelivered: false } }
      );

      for (const item of pendingGroupReceipts) {
        await syncGroupMessageAggregateStatus(io, item.messageId, item.groupId);
      }
    }
  } catch (error) {
    console.error("Group auto-join/delivery sync error:", error.message);
  }

  socket.on("join_group_room", async ({ groupId }) => {
    try {
      if (!groupId) return;
      const isMember = await GroupMember.findOne({
        where: { groupId: Number(groupId), userId: id },
      });
      if (!isMember) return;

      socket.join(getGroupRoomId(groupId));
    } catch (error) {
      console.error("Join group room error:", error.message);
    }
  });

  socket.on("mark_group_read", async ({ groupId }) => {
    try {
      if (!groupId) return;
      const targetGroupId = Number(groupId);

      const unreadReceipts = await GroupMessageReceipt.findAll({
        where: {
          groupId: targetGroupId,
          userId: id,
          isRead: false,
        },
        attributes: ["messageId"],
      });

      if (unreadReceipts.length === 0) return;

      await GroupMessageReceipt.update(
        { isDelivered: true, isRead: true },
        {
          where: {
            groupId: targetGroupId,
            userId: id,
            isRead: false,
          },
        }
      );

      const uniqueMsgIds = [...new Set(unreadReceipts.map((r) => r.messageId))];
      for (const msgId of uniqueMsgIds) {
        await syncGroupMessageAggregateStatus(io, msgId, targetGroupId);
      }
    } catch (error) {
      console.error("Mark group read error:", error.message);
    }
  });

  socket.on("group_typing", ({ groupId }) => {
    if (!groupId) return;
    const roomId = getGroupRoomId(groupId);
    socket.to(roomId).emit("user_typing", {
      userId: id,
      name,
      groupId: Number(groupId),
      isGroup: true,
    });
  });

  socket.on("group_stop_typing", ({ groupId }) => {
    if (!groupId) return;
    const roomId = getGroupRoomId(groupId);
    socket.to(roomId).emit("user_stop_typing", {
      userId: id,
      groupId: Number(groupId),
      isGroup: true,
    });
  });
};
