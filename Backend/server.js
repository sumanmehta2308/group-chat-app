import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./src/app.js";
import sequelize from "./src/config/database.js";
import "./src/models/user.js";
import "./src/models/message.js";
import { initSocket } from "./src/socket-io/index.js";

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

initSocket(server);

sequelize
  .sync({ alter: true })
  .then(() => {
    console.log("MySQL Database connected & synced successfully.");
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed:", err);
  });
