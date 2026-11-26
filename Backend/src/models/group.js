import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import User from "./user.js";

const Group = sequelize.define(
  "Group",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
  },
  {
    tableName: "groups",
    timestamps: true,
  }
);

User.hasMany(Group, { foreignKey: "createdBy", onDelete: "CASCADE" });
Group.belongsTo(User, { foreignKey: "createdBy", as: "creator" });

export default Group;
