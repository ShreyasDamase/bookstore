import express from "express";
import cors from "cors";
import "dotenv/config";
import job from "./lib/cron.js";
import path from "path";
import authRoutes from "./routes/authRoutes.js";
import bookRoutes from "./routes/bookRoutes.js";

import { connectDB } from "./lib/db.js";

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

job.start();
app.use(express.json());
app.use(cors());
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}. http://localhost:3000/`);
  connectDB();
});
