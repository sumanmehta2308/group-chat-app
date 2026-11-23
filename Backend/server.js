import dotenv from "dotenv";
dotenv.config();
import app from "./src/app.js";
import sequelize from "./src/config/database.js";
import "./src/models/user.js";
import "./src/models/message.js";
const PORT = process.env.PORT || 5000;

sequelize
  .sync({ alter: true })
  .then(() => {
    console.log("MySQL Database connected & synced successfully.");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed:", err);
  });
