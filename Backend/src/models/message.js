import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import User from "./user.js";

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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: "messages",
    timestamps: true,
  }
);

User.hasMany(Message, { foreignKey: "senderId", onDelete: "CASCADE" });
Message.belongsTo(User, { foreignKey: "senderId", as: "sender" });

export default Message;
