import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => /^\S+@\S+\.\S+$/.test(v),
        message: "Invalid email format",
      },
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    profileImage: {
      type: String,
      default: "",
    },

    refreshToken: {
      type: String,
      default: null,
    },

    tokenVersion: {
      type: Number,
      default: 0,
    },

    // Forgot Password OTP
    resetOTP: { type: String, default: null },
    resetOTPExpires: { type: Date, default: null },

    // Registration OTP
    registerOTP: { type: String, default: null },
    registerOTPExpires: { type: Date, default: null },

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Hash password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  next();
});

// Compare password
userSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

export default mongoose.model("User", userSchema);
