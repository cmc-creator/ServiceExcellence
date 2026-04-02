import express from "express";
import { z } from "zod";
import { db } from "../lib/db.js";
import { comparePassword, signToken } from "../lib/auth.js";

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

  const { email, password, organizationSlug } = parsed.data;

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

export default router;
