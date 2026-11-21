import express from "express";
import {
  signupUser,
  verifyOtp,
  setPassword,
  loginUser,
  forgotPassword,
  getMe,
  logoutUser,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/signup", signupUser);
router.post("/verify-otp", verifyOtp);
router.post("/set-password", setPassword);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.get("/me", protect, getMe);
router.post("/logout", logoutUser);
export default router;
