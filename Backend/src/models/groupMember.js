import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import User from "./user.js";
import Group from "./group.js";

const GroupMember = sequelize.define(
  "GroupMember",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
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
  },
  {
    tableName: "group_members",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["groupId", "userId"],
      },
    ],
  }
);

Group.belongsToMany(User, {
  through: GroupMember,
  foreignKey: "groupId",
  otherKey: "userId",
  as: "members",
});
User.belongsToMany(Group, {
  through: GroupMember,
  foreignKey: "userId",
  otherKey: "groupId",
  as: "groups",
});

GroupMember.belongsTo(User, { foreignKey: "userId", as: "user" });
GroupMember.belongsTo(Group, { foreignKey: "groupId", as: "group" });

export default GroupMember;
