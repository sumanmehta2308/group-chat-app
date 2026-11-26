import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { uploadMedia } from "../middleware/uploadMiddleware.js";
import {
  sendMessage,
  deleteMessage,
  getMessages,
  getUsersList,
  verifyUserByEmail,
  createGroup,
  getUserGroups,
  removeGroupMember,
  getAiSmartReplies,
  getAiPredictiveTyping,
} from "../controllers/chatController.js";

const router = express.Router();

router.get("/users", protect, getUsersList);
router.get("/verify-user", protect, verifyUserByEmail);
router.get("/groups", protect, getUserGroups);
router.post("/groups", protect, createGroup);
router.delete("/groups/:groupId/members/:userId", protect, removeGroupMember);

router.get("/messages", protect, getMessages);
router.post("/messages", protect, uploadMedia.single("media"), sendMessage);
router.post("/messages/:messageId/delete", protect, deleteMessage);

router.post("/ai/smart-replies", protect, getAiSmartReplies);
router.post("/ai/predict", protect, getAiPredictiveTyping);

export default router;
