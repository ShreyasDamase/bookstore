import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import protectRoute from "../middleware/auth.middleware.js";
import cloudinary from "../lib/cloudinary.js";
import Book from "../models/Book.js";
import { mailTransporter } from "../lib/nodemailer.js";

const router = express.Router();
const sendOtpEmail = async (email, otp) => {
  await mailTransporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your Password Reset OTP",
    html: `
      <h2>Your OTP Code</h2>
      <p style="font-size: 18px; font-weight: bold;">${otp}</p>
      <p>This OTP will expire in 5 minutes.</p>
    `,
  });
};

// Generate both tokens
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { userId: user._id, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );

  const refreshToken = jwt.sign(
    { userId: user._id, tokenVersion: user.tokenVersion },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" },
  );

  return { accessToken, refreshToken };
};

// router.post("/register", async (req, res) => {
//   try {
//     const { email, username, password } = req.body;

//     if (!username || !email || !password) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     if (password.length < 6) {
//       return res
//         .status(400)
//         .json({ message: "Password should be at least 6 characters long" });
//     }

//     if (username.length < 3) {
//       return res
//         .status(400)
//         .json({ message: "Username should be at least 3 characters long" });
//     }

//     const existingEmail = await User.findOne({ email });
//     if (existingEmail) {
//       return res.status(400).json({ message: "Email already exists" });
//     }

//     const existingUsername = await User.findOne({ username });
//     if (existingUsername) {
//       return res.status(400).json({ message: "Username already exists" });
//     }

//     const profileImage = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

//     const user = new User({
//       email,
//       username,
//       password,
//       profileImage,
//     });

//     await user.save();

//     const { accessToken, refreshToken } = generateTokens(user);

//     // Optional: Store refresh token in DB for logout functionality
//     user.refreshToken = refreshToken;
//     await user.save();

//     res.status(201).json({
//       accessToken,
//       refreshToken,
//       user: {
//         id: user._id,
//         username: user.username,
//         email: user.email,
//         profileImage: user.profileImage,
//         createdAt: user.createdAt,
//       },
//     });
//   } catch (error) {
//     console.log("Error in register route", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

router.post("/register-request", async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password)
      return res.status(400).json({ message: "All fields required" });

    const existingEmail = await User.findOne({ email });
    if (existingEmail)
      return res.status(400).json({ message: "Email already exists" });

    const existingUsername = await User.findOne({ username });
    if (existingUsername)
      return res.status(400).json({ message: "Username already exists" });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Create temp user
    const user = new User({
      email,
      username,
      password,
      profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      registerOTP: otp,
      registerOTPExpires: Date.now() + 5 * 60 * 1000,
      isVerified: false,
    });

    await user.save();

    await sendOtpEmail(email, otp);

    res.json({ message: "OTP sent to your email" });
  } catch (err) {
    console.log("Register OTP error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
router.post("/verify-register", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (
      !user ||
      user.registerOTP !== otp ||
      user.registerOTPExpires < Date.now()
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Mark user as verified
    user.isVerified = true;
    user.registerOTP = null;
    user.registerOTPExpires = null;

    await user.save();

    const { accessToken, refreshToken } = generateTokens(user);

    res.json({
      message: "Registration complete",
      accessToken,
      refreshToken,
      user,
    });
  } catch (err) {
    console.log("Verify register OTP error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "All fields are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // ⛔ BLOCK LOGIN IF EMAIL NOT VERIFIED
    if (!user.isVerified) {
      return res.status(403).json({ message: "Please verify your email" });
    }

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect)
      return res.status(400).json({ message: "Invalid credentials" });

    const { accessToken, refreshToken } = generateTokens(user);

    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.log("Error in login route", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// NEW: Refresh Token Endpoint
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // 🔥 tokenVersion check (logout protection)
    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ message: "User logged out" });
    }

    // 🔥 IMPORTANT — match refresh token with DB
    if (user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Refresh token mismatch" });
    }

    // ===== GENERATE NEW TOKENS =====
    const newAccessToken = jwt.sign(
      { userId: user._id, tokenVersion: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    const newRefreshToken = jwt.sign(
      { userId: user._id, tokenVersion: user.tokenVersion },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" },
    );

    // 🔥 Save new refresh token in DB
    user.refreshToken = newRefreshToken;
    await user.save();

    res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.log("Error in refresh route", error);
    res.status(401).json({ message: "Invalid refresh token" });
  }
});

// DELETE ACCOUNT (User + All Books + Cloudinary Images)
router.delete("/delete-account", protectRoute, async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Find all books created by the user
    const books = await Book.find({ user: userId });

    // 2. Delete cloudinary images for each book
    for (const book of books) {
      if (book.image && book.image.includes("cloudinary")) {
        try {
          const publicId = book.image.split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.log("Cloudinary deletion error:", err);
        }
      }

      await book.deleteOne(); // remove book from DB
    }

    // 3. Remove refresh token
    await User.findByIdAndUpdate(userId, { refreshToken: null });

    // 4. Delete user from DB
    await User.findByIdAndDelete(userId);

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
router.post("/logout", protectRoute, async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    refreshToken: null,
    $inc: { tokenVersion: 1 }, // invalidate ALL existing tokens
  });

  res.json({ message: "Logged out successfully" });
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      console.log("Forgot Password → No email provided");
      return res.status(400).json({ message: "Email is required" });
    }

    console.log("Forgot Password → Request received for:", email);

    const user = await User.findOne({ email });

    if (!user) {
      console.log("Forgot Password → Email not found:", email);
      return res.json({ message: "If this email exists, OTP has been sent" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetOTP = otp;
    user.resetOTPExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    console.log("Forgot Password → OTP generated:", otp);

    // Send email
    try {
      await sendOtpEmail(email, otp);
      console.log("Forgot Password → OTP email sent to:", email);
    } catch (mailErr) {
      console.log("Forgot Password → Email sending failed:", mailErr);
    }

    return res.json({ message: "If this email exists, OTP has been sent" });
  } catch (error) {
    console.log("Forgot Password → Server error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: "All fields required" });

    const user = await User.findOne({ email });

    const invalid =
      !user || user.resetOTP !== otp || user.resetOTPExpires < Date.now();

    if (invalid) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Update password
    user.password = newPassword;

    // Clear OTP fields
    user.resetOTP = null;
    user.resetOTPExpires = null;

    // Invalidate all tokens
    user.tokenVersion += 1;
    user.refreshToken = null;

    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.log("Reset password error:", error);
    res.status(500).json({ message: "Server error" });
  }
});
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ message: "If this email exists, OTP has been resent" });
    }

    // CASE 1: Not Verified → resend register OTP
    if (!user.isVerified) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      user.registerOTP = otp;
      user.registerOTPExpires = Date.now() + 5 * 60 * 1000;
      await user.save();

      await sendOtpEmail(email, otp);

      return res.json({ message: "Registration OTP resent to your email" });
    }

    // CASE 2: Verified user → resend forgot-password OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetOTP = otp;
    user.resetOTPExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    await sendOtpEmail(email, otp);

    return res.json({ message: "Password reset OTP resent to your email" });
  } catch (error) {
    console.log("Resend OTP error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
