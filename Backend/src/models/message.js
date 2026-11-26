import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import User from "./user.js";
import Group from "./group.js";

const Message = sequelize.define(
  "Message",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    senderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    receiverId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      references: {
        model: User,
        key: "id",
      },
    },
    groupId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      references: {
        model: Group,
        key: "id",
      },
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
  },
  {
    tableName: "messages",
    timestamps: true,
  }
);

User.hasMany(Message, { foreignKey: "senderId", onDelete: "CASCADE" });
Message.belongsTo(User, { foreignKey: "senderId", as: "sender" });
Message.belongsTo(User, { foreignKey: "receiverId", as: "receiver" });
Group.hasMany(Message, { foreignKey: "groupId", onDelete: "CASCADE" });
Message.belongsTo(Group, { foreignKey: "groupId", as: "group" });

export default Message;
