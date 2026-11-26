import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const ArchivedChat = sequelize.define(
  "ArchivedChat",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    originalMessageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    senderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    receiverId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    groupId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: "",
    },
    mediaUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    mediaType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null,
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    isDelivered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    originalCreatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "archived_chats",
    timestamps: true,
  }
);

export default ArchivedChat;
