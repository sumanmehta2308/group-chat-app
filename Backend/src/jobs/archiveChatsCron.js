import cron from "node-cron";
import { Op } from "sequelize";
import sequelize from "../config/database.js";
import Message from "../models/message.js";
import ArchivedChat from "../models/archivedChat.js";

export const archiveOldMessages = async () => {
  const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const transaction = await sequelize.transaction();

  try {
    const oldMessages = await Message.findAll({
      where: {
        createdAt: { [Op.lt]: cutoffDate },
      },
      transaction,
    });

    if (oldMessages.length === 0) {
      await transaction.commit();
      console.log("[Cron] No messages older than 24 hours to archive.");
      return 0;
    }

    const archivePayload = oldMessages.map((msg) => ({
      originalMessageId: msg.id,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      groupId: msg.groupId,
      content: msg.content,
      mediaUrl: msg.mediaUrl,
      mediaType: msg.mediaType,
      fileName: msg.fileName,
      isDelivered: msg.isDelivered,
      isRead: msg.isRead,
      originalCreatedAt: msg.createdAt,
    }));

    await ArchivedChat.bulkCreate(archivePayload, {
      ignoreDuplicates: true,
      transaction,
    });

    const oldMessageIds = oldMessages.map((m) => m.id);
    await Message.destroy({
      where: {
        id: { [Op.in]: oldMessageIds },
      },
      transaction,
    });

    await transaction.commit();
    console.log(
      `[Cron] Archived and cleaned up ${oldMessageIds.length} messages older than 24 hours.`
    );
    return oldMessageIds.length;
  } catch (error) {
    await transaction.rollback();
    console.error("[Cron] Failed to archive old messages:", error.message);
    throw error;
  }
};

export const startArchiveCronJob = () => {
  cron.schedule("0 2 * * *", async () => {
    console.log("[Cron] Running nightly chat archival job...");
    await archiveOldMessages();
  });

  console.log("[Cron] Nightly chat archival scheduler initialized (02:00 AM).");
};
