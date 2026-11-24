import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  sendMessage,
  getMessages,
  getUsersList,
} from "../controllers/chatController.js";

const router = express.Router();

router.get("/users", protect, getUsersList);
router.get("/messages", protect, getMessages);
router.post("/messages", protect, sendMessage);

export default router;
