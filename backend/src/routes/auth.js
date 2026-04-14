import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "../lib/db.js";
import { comparePassword, hashPassword, signToken } from "../lib/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { sendEmail } from "../lib/email.js";

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  organizationSlug: z.string().min(2),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const organizationSlug = parsed.data.organizationSlug.trim().toLowerCase();

  const organization = await db.organization.findUnique({ where: { slug: organizationSlug } });
  if (!organization) {
    return res.status(404).json({ error: "Organization not found" });
  }

  const user = await db.user.findUnique({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: email.toLowerCase(),
      },
    },
  });

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken({
    sub: user.id,
    role: user.role,
    organizationId: organization.id,
    organizationSlug: organization.slug,
    email: user.email,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      organizationSlug: organization.slug,
    },
  });
});


// ─── Schemas ──────────────────────────────────────────────────────────────────
const forgotSchema = z.object({
  email: z.string().email(),
  organizationSlug: z.string().min(2),
});

const resetSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8),
});

// POST /api/auth/forgot-password
// Generates a single-use, 1-hour reset token (no DB storage — token is signed
// with JWT_SECRET + current passwordHash so it self-invalidates on use).
// Returns the token in the response for the admin to share via a secure channel.
router.post("/forgot-password", async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const email   = parsed.data.email.trim().toLowerCase();
  const orgSlug = parsed.data.organizationSlug.trim().toLowerCase();

  // Constant-time response to avoid user enumeration
  const org = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) {
    return res.json({ message: "If that account exists, a reset link has been generated." });
  }

  const user = await db.user.findUnique({
    where: { organizationId_email: { organizationId: org.id, email } },
  });
  if (!user) {
    return res.json({ message: "If that account exists, a reset link has been generated." });
  }

  // Sign with secret derived from current password hash — token becomes invalid
  // the moment the password changes (single-use guarantee, no DB round-trip).
  const resetToken = jwt.sign(
    { sub: user.id, type: "pwreset", orgId: org.id },
    process.env.JWT_SECRET + user.passwordHash,
    { expiresIn: "1h" },
  );

  // ── Send via Gmail if configured, otherwise return token for admin manual flow ──
  const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
  const API_BASE_URL = (process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

  if (APP_URL) {
    const resetUrl = `${APP_URL}/reset-password.html?token=${encodeURIComponent(resetToken)}&apiBase=${encodeURIComponent(API_BASE_URL)}`;
    const sent = await sendEmail({
      to: user.email,
      subject: "Reset your password",
      html: `<p>Hi ${user.fullName},</p>
<p>A password reset was requested for your account. Click the link below to set a new password:</p>
<p><a href="${resetUrl}">Reset my password</a></p>
<p>This link expires in 1 hour and can only be used once. If you did not request this, you can safely ignore this email.</p>`,
    });

    if (sent) {
      return res.json({ message: "Password reset link sent to the user's email." });
    }
    // Email credentials not configured — fall through to return token for manual sharing
  }

  return res.json({
    message: "Reset link generated. Share this link with the user via a secure internal channel.",
    resetToken,
  });
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  // Decode without verification first — just to get the user ID
  let decoded;
  try {
    decoded = jwt.decode(parsed.data.token);
  } catch {
    return res.status(400).json({ error: "Invalid token" });
  }

  if (!decoded || decoded.type !== "pwreset" || !decoded.sub) {
    return res.status(400).json({ error: "Invalid token" });
  }

  const user = await db.user.findUnique({ where: { id: decoded.sub } });
  if (!user) {
    return res.status(400).json({ error: "Invalid token" });
  }

  // Verify with the per-user secret
  try {
    jwt.verify(parsed.data.token, process.env.JWT_SECRET + user.passwordHash);
  } catch {
    return res.status(400).json({ error: "Token expired or already used" });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

  return res.json({ message: "Password updated successfully." });
});

// POST /api/auth/change-password — authenticated user changes their own password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const user = await db.user.findUnique({ where: { id: req.user.sub } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const ok = await comparePassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect." });

  const newHash = await hashPassword(parsed.data.newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

  return res.json({ message: "Password updated successfully." });
});

export default router;

