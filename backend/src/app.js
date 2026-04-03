import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import trainingRoutes from "./routes/training.js";
import analyticsRoutes from "./routes/analytics.js";

const app = express();
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Allow server-to-server or same-origin requests with no Origin header.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS origin not allowed"));
  },
  credentials: true,
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nyxarete-training-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/training", trainingRoutes);
app.use("/api/analytics", analyticsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

export default app;
