import express from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword } from "../lib/auth.js";

const router = express.Router();

router.use(requireAuth);

const learnerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  employeeId: z.string().optional(),
  department: z.string().optional(),
  roleTrack: z.string().optional(),
});

const enrollmentSchema = z.object({
  learnerId: z.string(),
  courseId: z.string(),
  dueDate: z.string().datetime().optional(),
});

router.get("/dashboard", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const orgId = req.user.organizationId;
  const [learners, courses, attempts, passed] = await Promise.all([
    db.learner.count({ where: { organizationId: orgId } }),
    db.course.count({ where: { organizationId: orgId, isActive: true } }),
    db.attempt.count({ where: { organizationId: orgId } }),
    db.attempt.count({ where: { organizationId: orgId, status: "PASSED" } }),
  ]);

  return res.json({ learners, courses, attempts, passed });
});

router.post("/learners", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const parsed = learnerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const learner = await db.learner.create({
    data: {
      ...parsed.data,
      email: parsed.data.email.toLowerCase(),
      organizationId: req.user.organizationId,
    },
  });

  return res.status(201).json(learner);
});

router.get("/learners", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const cursorId = req.query.cursor || null;

  const rows = await db.learner.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return res.json({ data, nextCursor, hasMore });
});

router.post("/learners/bulk", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const bulkSchema = z.array(
    z.object({
      fullName: z.string().min(2),
      email: z.string().email(),
      employeeId: z.string().optional(),
      department: z.string().optional(),
      roleTrack: z.string().optional(),
    })
  ).min(1).max(500);

  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const orgId = req.user.organizationId;
  const results = { created: 0, skipped: 0 };

  for (const row of parsed.data) {
    const email = row.email.toLowerCase();
    const existing = await db.learner.findFirst({ where: { organizationId: orgId, email } });
    if (existing) { results.skipped++; continue; }
    await db.learner.create({ data: { ...row, email, organizationId: orgId } });
    results.created++;
  }

  return res.status(201).json(results);
});

router.post("/enrollments", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const parsed = enrollmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const enrollment = await db.enrollment.upsert({
    where: {
      organizationId_learnerId_courseId: {
        organizationId: req.user.organizationId,
        learnerId: parsed.data.learnerId,
        courseId: parsed.data.courseId,
      },
    },
    update: {
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
    create: {
      organizationId: req.user.organizationId,
      learnerId: parsed.data.learnerId,
      courseId: parsed.data.courseId,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  return res.status(201).json(enrollment);
});

router.post("/courses", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  const schema = z.object({
    code: z.string().min(2),
    title: z.string().min(2),
    version: z.string().min(1),
    passPercent: z.number().int().min(1).max(100).default(80),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const course = await db.course.create({
    data: {
      ...parsed.data,
      organizationId: req.user.organizationId,
    },
  });

  return res.status(201).json(course);
});

router.get("/certificates", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const rows = await db.certificate.findMany({
    where: { organizationId: req.user.organizationId },
    include: {
      learner: true,
      course: true,
    },
    orderBy: { issuedAt: "desc" },
    take: 200,
  });

  return res.json(rows);
});

router.post("/issue-certificate/:attemptId", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const attempt = await db.attempt.findFirst({
    where: {
      id: req.params.attemptId,
      organizationId: req.user.organizationId,
      status: "PASSED",
    },
  });

  if (!attempt) {
    return res.status(404).json({ error: "Passed attempt not found" });
  }

  const cert = await db.certificate.upsert({
    where: { attemptId: attempt.id },
    update: {},
    create: {
      attemptId: attempt.id,
      organizationId: req.user.organizationId,
      learnerId: attempt.learnerId,
      courseId: attempt.courseId,
      certificateNo: `NYX-${nanoid(10).toUpperCase()}`,
    },
  });

  return res.status(201).json(cert);
});

router.get("/certificates/:id", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const cert = await db.certificate.findFirst({
    where: {
      id: req.params.id,
      organizationId: req.user.organizationId,
    },
    include: {
      learner: true,
      course: true,
      attempt: true,
    },
  });

  if (!cert) {
    return res.status(404).json({ error: "Certificate not found" });
  }

  return res.json(cert);
});

router.patch("/learners/:id", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const learner = await db.learner.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!learner) return res.status(404).json({ error: "Learner not found" });

  const { fullName, email, employeeId, department, roleTrack } = req.body;

  // Guard against duplicate email in the same org
  if (email && email.toLowerCase() !== learner.email) {
    const conflict = await db.learner.findFirst({
      where: {
        organizationId: req.user.organizationId,
        email: email.toLowerCase(),
        NOT: { id: req.params.id },
      },
    });
    if (conflict) {
      return res.status(409).json({ error: "A learner with that email already exists in this organization." });
    }
  }

  const updated = await db.learner.update({
    where: { id: req.params.id },
    data: {
      ...(fullName ? { fullName } : {}),
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(employeeId !== undefined ? { employeeId: employeeId || null } : {}),
      ...(department !== undefined ? { department: department || null } : {}),
      ...(roleTrack !== undefined ? { roleTrack: roleTrack || null } : {}),
    },
  });
  return res.json(updated);
});

router.delete("/learners/:id", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  const learner = await db.learner.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!learner) return res.status(404).json({ error: "Learner not found" });
  await db.learner.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

router.patch("/enrollments/:id", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const enrollment = await db.enrollment.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!enrollment) return res.status(404).json({ error: "Enrollment not found" });

  const schema = z.object({ dueDate: z.string().datetime().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const updated = await db.enrollment.update({
    where: { id: req.params.id },
    data: { dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null },
  });
  return res.json(updated);
});

router.get("/enrollments", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const enrollments = await db.enrollment.findMany({
    where: { organizationId: req.user.organizationId },
    include: { learner: true, course: true },
    orderBy: { enrolledAt: "desc" },
  });

  if (!enrollments.length) return res.json([]);

  const passedAttempts = await db.attempt.findMany({
    where: { organizationId: req.user.organizationId, status: "PASSED" },
    orderBy: { submittedAt: "desc" },
    select: { id: true, learnerId: true, courseId: true },
  });

  const passedMap = new Map();
  for (const a of passedAttempts) {
    const key = `${a.learnerId}|${a.courseId}`;
    if (!passedMap.has(key)) passedMap.set(key, a.id);
  }

  const result = enrollments.map((e) => ({
    ...e,
    passAttemptId: passedMap.get(`${e.learnerId}|${e.courseId}`) ?? null,
  }));

  return res.json(result);
});

router.delete("/enrollments/:id", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const enrollment = await db.enrollment.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!enrollment) return res.status(404).json({ error: "Enrollment not found" });
  await db.enrollment.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ─── User Management ──────────────────────────────────────────────────────────
const userCreateSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "STAFF"]).default("STAFF"),
});

const userUpdateSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "STAFF"]).optional(),
  newPassword: z.string().min(8).optional(),
});

router.get("/users", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  const users = await db.user.findMany({
    where: { organizationId: req.user.organizationId },
    select: { id: true, fullName: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return res.json(users);
});

router.post("/users", requireRole(["OWNER"]), async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const existing = await db.user.findUnique({
    where: {
      organizationId_email: {
        organizationId: req.user.organizationId,
        email: parsed.data.email.toLowerCase(),
      },
    },
  });
  if (existing) return res.status(409).json({ error: "A user with that email already exists." });

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await db.user.create({
    data: {
      fullName: parsed.data.fullName,
      email: parsed.data.email.toLowerCase(),
      passwordHash,
      role: parsed.data.role,
      organizationId: req.user.organizationId,
    },
    select: { id: true, fullName: true, email: true, role: true, createdAt: true },
  });
  return res.status(201).json(user);
});

router.patch("/users/:id", requireRole(["OWNER"]), async (req, res) => {
  if (req.params.id === req.user.sub && req.body.role && req.body.role !== req.user.role) {
    return res.status(400).json({ error: "You cannot change your own role." });
  }

  const target = await db.user.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!target) return res.status(404).json({ error: "User not found" });

  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  if (parsed.data.email && parsed.data.email.toLowerCase() !== target.email) {
    const conflict = await db.user.findUnique({
      where: {
        organizationId_email: {
          organizationId: req.user.organizationId,
          email: parsed.data.email.toLowerCase(),
        },
      },
    });
    if (conflict) return res.status(409).json({ error: "A user with that email already exists." });
  }

  const updateData = {};
  if (parsed.data.fullName) updateData.fullName = parsed.data.fullName;
  if (parsed.data.email) updateData.email = parsed.data.email.toLowerCase();
  if (parsed.data.role) updateData.role = parsed.data.role;
  if (parsed.data.newPassword) updateData.passwordHash = await hashPassword(parsed.data.newPassword);

  const updated = await db.user.update({
    where: { id: req.params.id },
    data: updateData,
    select: { id: true, fullName: true, email: true, role: true, createdAt: true },
  });
  return res.json(updated);
});

router.delete("/users/:id", requireRole(["OWNER"]), async (req, res) => {
  if (req.params.id === req.user.sub) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }
  const target = await db.user.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!target) return res.status(404).json({ error: "User not found" });
  await db.user.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get("/settings", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  const org = await db.organization.findUnique({
    where: { id: req.user.organizationId },
    select: { id: true, name: true, slug: true },
  });
  return res.json(org);
});

router.patch("/settings", requireRole(["OWNER"]), async (req, res) => {
  const schema = z.object({ name: z.string().min(2) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const org = await db.organization.update({
    where: { id: req.user.organizationId },
    data: { name: parsed.data.name },
    select: { id: true, name: true, slug: true },
  });
  return res.json(org);
});

// ─── Course management ────────────────────────────────────────────────────────

router.get("/courses", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  const courses = await db.course.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "asc" },
  });
  return res.json(courses);
});

router.patch("/courses/:id", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  const course = await db.course.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!course) return res.status(404).json({ error: "Course not found" });
  const schema = z.object({
    title: z.string().min(2).optional(),
    isActive: z.boolean().optional(),
    passPercent: z.number().int().min(1).max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const updated = await db.course.update({ where: { id: req.params.id }, data: parsed.data });
  return res.json(updated);
});

// ─── Enrollment reminder email ────────────────────────────────────────────────

router.post("/enrollments/:id/remind", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const enrollment = await db.enrollment.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: { learner: true, course: true },
  });
  if (!enrollment) return res.status(404).json({ error: "Enrollment not found" });
  if (enrollment.completedAt) {
    return res.status(400).json({ error: "Learner has already completed this course." });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || "training@noreply.nyxarete.com";
  const APP_URL = process.env.APP_URL || "";

  if (!RESEND_API_KEY) {
    return res.status(503).json({ error: "Email service not configured. Set RESEND_API_KEY in environment variables." });
  }

  const dueStr = enrollment.dueDate
    ? new Date(enrollment.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "no set deadline";

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: enrollment.learner.email,
      subject: `Reminder: Complete your ${enrollment.course.title} training`,
      html: `<p>Hi ${enrollment.learner.fullName},</p>
<p>This is a friendly reminder to complete your <strong>${enrollment.course.title}</strong> training (due: <strong>${dueStr}</strong>).</p>
${APP_URL ? `<p><a href="${APP_URL}">Log in to complete your training</a></p>` : ""}
<p>If you have questions, contact your administrator.</p>`,
    }),
  });

  if (!emailRes.ok) {
    const body = await emailRes.json().catch(() => ({}));
    return res.status(502).json({ error: body.message || "Failed to send reminder email." });
  }

  return res.json({ message: `Reminder sent to ${enrollment.learner.email}.` });
});

export default router;
