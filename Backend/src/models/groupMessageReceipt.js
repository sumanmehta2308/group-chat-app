import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import Message from "./message.js";
import User from "./user.js";
import Group from "./group.js";

const GroupMessageReceipt = sequelize.define(
  "GroupMessageReceipt",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    messageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Message,
        key: "id",
      },
    },
    groupId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Group,
        key: "id",
      },
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
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
    tableName: "group_message_receipts",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["messageId", "userId"],
      },
    ],
  }
);

Message.hasMany(GroupMessageReceipt, {
  foreignKey: "messageId",
  as: "receipts",
  onDelete: "CASCADE",
});
GroupMessageReceipt.belongsTo(Message, { foreignKey: "messageId" });
GroupMessageReceipt.belongsTo(User, { foreignKey: "userId" });

export default GroupMessageReceipt;
