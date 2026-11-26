import GroupMember from "../../models/groupMember.js";

export const getGroupRoomId = (groupId) => `group_${Number(groupId)}`;

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
  } catch (error) {
    console.error("Group auto-join error:", error.message);
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
