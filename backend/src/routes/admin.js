import express from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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
  const rows = await db.learner.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return res.json(rows);
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
  const updated = await db.learner.update({
    where: { id: req.params.id },
    data: {
      ...(fullName ? { fullName } : {}),
      ...(email ? { email } : {}),
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

export default router;
