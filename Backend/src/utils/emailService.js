import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendOtpEmail(toEmail, fullName, otp) {
  console.log(`\n[OTP SERVICE] Email: ${toEmail} | OTP: ${otp}\n`);
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return;
  }

  const mailOptions = {
    from: `"Group Chat" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Your Verification OTP - Group Chat",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #00a884;">Verify Your Email</h2>
        <p>Hi <strong>${fullName}</strong>,</p>
        <p>Use the following 6-digit OTP to verify your email address. This code is valid for <strong>10 minutes</strong>.</p>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 15px; background: #f0f2f5; border-radius: 8px; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #6c757d; font-size: 12px;">If you did not request this, please ignore this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

export async function sendResetPasswordEmail(toEmail, userName, resetUrl) {
  console.log(`\n[RESET SERVICE] Email: ${toEmail} | Link: ${resetUrl}\n`);
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return;
  }

  const mailOptions = {
    from: `"Group Chat Support" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Reset Your Group Chat Password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 10px;">
        <h2 style="color: #111827; margin-bottom: 8px;">Password Reset Request</h2>
        <p style="color: #4b5563;">Hi <strong>${
          userName || "User"
        }</strong>,</p>
        <p style="color: #4b5563;">We received a request to reset your password. Click the button below to set a new password (valid for 15 minutes):</p>
        <div style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #00a884; color: #ffffff; padding: 12px 22px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #6b7280; font-size: 13px;">Or copy and paste this link in your browser:<br/><a href="${resetUrl}">${resetUrl}</a></p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}
