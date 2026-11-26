import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { uploadMedia } from "../middleware/uploadMiddleware.js";
import {
  sendMessage,
  getMessages,
  getUsersList,
  verifyUserByEmail,
  createGroup,
  getUserGroups,
} from "../controllers/chatController.js";

const router = express.Router();

router.get("/users", protect, getUsersList);
router.get("/verify-user", protect, verifyUserByEmail);
router.get("/groups", protect, getUserGroups);
router.post("/groups", protect, createGroup);
router.get("/messages", protect, getMessages);
router.post("/messages", protect, uploadMedia.single("media"), sendMessage);

export default router;
