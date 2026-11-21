import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import User from "../models/User.js";
import { sendOtpEmail, sendResetPasswordEmail } from "../utils/emailService.js";

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const checkAndUpdateRateLimit = (user) => {
  const now = new Date();
  const windowMs = 24 * 60 * 60 * 1000;
  const maxAttempts = 5;

  if (!user.otpWindowStart || now - new Date(user.otpWindowStart) > windowMs) {
    user.otpWindowStart = now;
    user.otpRequestCount = 1;
    return true;
  }

  if (user.otpRequestCount >= maxAttempts) {
    return false;
  }

  user.otpRequestCount += 1;
  return true;
};

export const signupUser = async (req, res, next) => {
  try {
    const name = (req.body.full_name || req.body.name || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Full name and email are required",
      });
    }

    const existingUser = await User.findOne({ where: { email } });

    if (existingUser && existingUser.isVerified && existingUser.password) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered. Please sign in.",
      });
    }

    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    if (existingUser) {
      if (!checkAndUpdateRateLimit(existingUser)) {
        return res.status(429).json({
          success: false,
          message:
            "Maximum limit of 5 OTP requests in 24 hours reached. Try again later.",
        });
      }

      existingUser.name = name;
      existingUser.otp = otp;
      existingUser.otpExpires = otpExpires;
      await existingUser.save();
    } else {
      await User.create({
        name,
        email,
        isVerified: false,
        otp,
        otpExpires,
        otpRequestCount: 1,
        otpWindowStart: new Date(),
      });
    }

    await sendOtpEmail(email, name, otp);

    res.status(200).json({
      success: true,
      message: "Verification OTP sent to your email",
      email,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const otp = (req.body.otp || "").toString().trim();

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (new Date() > new Date(user.otpExpires)) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please resend OTP.",
      });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const setPassword = async (req, res, next) => {
  try {
    const { email, token, password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    let user = null;

    if (token) {
      const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      user = await User.findOne({
        where: {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: { [Op.gt]: new Date() },
        },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired password reset link",
        });
      }

      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
    } else if (email) {
      user = await User.findOne({
        where: { email: email.trim().toLowerCase() },
      });

      if (!user || !user.isVerified) {
        return res.status(400).json({
          success: false,
          message: "Please verify your email first",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Email or reset token is required",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.isVerified = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password set successfully! You can now sign in.",
    });
  } catch (error) {
    next(error);
  }
};

export const loginUser = async (req, res, next) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isVerified || !user.password) {
      if (!checkAndUpdateRateLimit(user)) {
        return res.status(429).json({
          success: false,
          message:
            "Maximum limit of 5 OTP requests in 24 hours reached. Try again later.",
        });
      }

      const otp = generateOtp();
      user.otp = otp;
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      await sendOtpEmail(user.email, user.name, otp);

      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        message:
          "Account setup incomplete. Verification OTP sent to your email.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = generateToken(user.id);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please provide your registered email",
      });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }

    if (!checkAndUpdateRateLimit(user)) {
      return res.status(429).json({
        success: false,
        message:
          "Maximum limit of 5 password/OTP requests in 24 hours reached. Try again later.",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/src/pages/set-password.html?token=${rawToken}`;

    await sendResetPasswordEmail(user.email, user.name, resetUrl);

    res.status(200).json({
      success: true,
      message: "Password reset link sent to your email",
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
};

export const logoutUser = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};
