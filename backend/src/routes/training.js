import express from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

const startSchema = z.object({
  organizationSlug: z.string().min(2),
  courseCode: z.string().min(2),
  courseVersion: z.string().min(1),
  learnerEmail: z.string().email(),
  learnerName: z.string().min(2),
  roleTrack: z.string().min(2),
  rolePersona: z.enum(["clinical", "nonclinical", "leadership"]).optional(),
  lmsSessionId: z.string().optional(),
});

const roleUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  persona: z.enum(["clinical", "nonclinical", "leadership"]),
  departments: z.array(z.string().min(1)).default([]),
});

const eventSchema = z.object({
  attemptId: z.string(),
  verb: z.string().min(2),
  payload: z.record(z.any()),
});

const completeSchema = z.object({
  attemptId: z.string(),
  scorePercent: z.number().int().min(0).max(100),
  scoreRaw: z.number().int().min(0),
  scoreMax: z.number().int().min(1),
  attested: z.boolean(),
});

function requestMatchesOrganization(req, organizationId, organizationSlug) {
  return req.user?.organizationId === organizationId || req.user?.organizationSlug === organizationSlug;
}

router.post("/start", requireAuth, async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const org = await db.organization.findUnique({ where: { slug: parsed.data.organizationSlug } });
  if (!org) {
    return res.status(404).json({ error: "Organization not found" });
  }

  if (!requestMatchesOrganization(req, org.id, org.slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const course = await db.course.findFirst({
    where: {
      organizationId: org.id,
      code: parsed.data.courseCode,
      version: parsed.data.courseVersion,
      isActive: true,
    },
  });
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }

  const learner = await db.learner.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: parsed.data.learnerEmail.toLowerCase(),
      },
    },
    update: {
      fullName: parsed.data.learnerName,
      roleTrack: parsed.data.roleTrack,
    },
    create: {
      organizationId: org.id,
      email: parsed.data.learnerEmail.toLowerCase(),
      fullName: parsed.data.learnerName,
      roleTrack: parsed.data.roleTrack,
    },
  });

  await db.enrollment.upsert({
    where: {
      organizationId_learnerId_courseId: {
        organizationId: org.id,
        learnerId: learner.id,
        courseId: course.id,
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      learnerId: learner.id,
      courseId: course.id,
    },
  });

  const attempt = await db.attempt.create({
    data: {
      organizationId: org.id,
      learnerId: learner.id,
      courseId: course.id,
      roleTrack: parsed.data.roleTrack,
      lmsSessionId: parsed.data.lmsSessionId,
    },
  });

  return res.status(201).json({
    attemptId: attempt.id,
    learnerId: learner.id,
    courseId: course.id,
    passPercent: course.passPercent,
  });
});

router.post("/event", requireAuth, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const attempt = await db.attempt.findUnique({ where: { id: parsed.data.attemptId } });
  if (!attempt) {
    return res.status(404).json({ error: "Attempt not found" });
  }

  if (req.user?.organizationId !== attempt.organizationId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const event = await db.trainingEvent.create({
    data: {
      organizationId: attempt.organizationId,
      courseId: attempt.courseId,
      learnerId: attempt.learnerId,
      attemptId: attempt.id,
      verb: parsed.data.verb,
      payload: parsed.data.payload,
    },
  });

  return res.status(201).json({ id: event.id });
});

router.post("/complete", requireAuth, async (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const attempt = await db.attempt.findUnique({
    where: { id: parsed.data.attemptId },
    include: { course: true },
  });

  if (!attempt) {
    return res.status(404).json({ error: "Attempt not found" });
  }

  if (req.user?.organizationId !== attempt.organizationId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const passed = parsed.data.scorePercent >= attempt.course.passPercent;

  const updated = await db.attempt.update({
    where: { id: attempt.id },
    data: {
      submittedAt: new Date(),
      status: passed ? "PASSED" : "FAILED",
      scorePercent: parsed.data.scorePercent,
      scoreRaw: parsed.data.scoreRaw,
      scoreMax: parsed.data.scoreMax,
      attested: parsed.data.attested,
    },
  });

  let certificate = null;
  if (passed) {
    await db.enrollment.updateMany({
      where: {
        organizationId: attempt.organizationId,
        learnerId: attempt.learnerId,
        courseId: attempt.courseId,
      },
      data: { completedAt: new Date() },
    });

    // Auto-issue certificate on first pass (upsert so retries are idempotent)
    certificate = await db.certificate.upsert({
      where: { attemptId: updated.id },
      update: {},
      create: {
        attemptId: updated.id,
        organizationId: attempt.organizationId,
        learnerId: attempt.learnerId,
        courseId: attempt.courseId,
        certificateNo: `NYX-${nanoid(10).toUpperCase()}`,
      },
    });
  }

  return res.json({
    attemptId: updated.id,
    status: updated.status,
    passed,
    certificateId: certificate?.id ?? null,
  });
});

router.get("/public/roles/:organizationSlug", async (req, res) => {
  const org = await db.organization.findUnique({ where: { slug: req.params.organizationSlug } });
  if (!org) {
    return res.status(404).json({ error: "Organization not found" });
  }

  const roles = await db.facilityRole.findMany({
    where: { organizationId: org.id },
    orderBy: [{ name: "asc" }],
  });

  return res.json(roles);
});

router.post("/public/roles/:organizationSlug", requireAuth, requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const parsed = roleUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const org = await db.organization.findUnique({ where: { slug: req.params.organizationSlug } });
  if (!org) {
    return res.status(404).json({ error: "Organization not found" });
  }

  if (!requestMatchesOrganization(req, org.id, org.slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  let role;
  if (parsed.data.id) {
    role = await db.facilityRole.updateMany({
      where: {
        id: parsed.data.id,
        organizationId: org.id,
      },
      data: {
        name: parsed.data.name,
        persona: parsed.data.persona,
        departments: parsed.data.departments,
      },
    });

    if (role.count === 0) {
      return res.status(404).json({ error: "Role not found" });
    }

    const updated = await db.facilityRole.findUnique({ where: { id: parsed.data.id } });
    return res.json(updated);
  }

  const created = await db.facilityRole.create({
    data: {
      organizationId: org.id,
      name: parsed.data.name,
      persona: parsed.data.persona,
      departments: parsed.data.departments,
    },
  });

  return res.status(201).json(created);
});

router.delete("/public/roles/:organizationSlug/:roleId", requireAuth, requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const org = await db.organization.findUnique({ where: { slug: req.params.organizationSlug } });
  if (!org) {
    return res.status(404).json({ error: "Organization not found" });
  }

  if (!requestMatchesOrganization(req, org.id, org.slug)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const count = await db.facilityRole.count({ where: { organizationId: org.id } });
  if (count <= 1) {
    return res.status(400).json({ error: "At least one role is required" });
  }

  const deleted = await db.facilityRole.deleteMany({
    where: {
      id: req.params.roleId,
      organizationId: org.id,
    },
  });

  if (deleted.count === 0) {
    return res.status(404).json({ error: "Role not found" });
  }

  return res.status(204).send();
});

router.get("/me", requireAuth, async (req, res) => {
  const { email, organizationId } = req.user;

  const learner = await db.learner.findUnique({
    where: { organizationId_email: { organizationId, email } },
  });

  if (!learner) {
    return res.json({
      learner: null,
      enrollments: [],
      attempts: [],
      certificates: [],
      summary: {
        totalCourses: 0,
        completedCourses: 0,
        passedAttempts: 0,
        failedAttempts: 0,
        inProgressAttempts: 0,
        bestScore: null,
        hasCertificate: false,
      },
    });
  }

  const [enrollments, attempts, certificates] = await Promise.all([
    db.enrollment.findMany({
      where: { organizationId, learnerId: learner.id },
      include: { course: true },
      orderBy: { enrolledAt: "desc" },
    }),
    db.attempt.findMany({
      where: { organizationId, learnerId: learner.id },
      include: { course: true },
      orderBy: { startedAt: "desc" },
    }),
    db.certificate.findMany({
      where: { organizationId, learnerId: learner.id },
      include: { course: true },
      orderBy: { issuedAt: "desc" },
    }),
  ]);

  const enrichedEnrollments = enrollments.map((e) => {
    const courseAttempts = attempts.filter((a) => a.courseId === e.courseId);
    const passedAttempts = courseAttempts.filter((a) => a.status === "PASSED");
    const bestAttempt =
      passedAttempts.sort((a, b) => (b.scorePercent ?? 0) - (a.scorePercent ?? 0))[0] ?? null;
    const inProgressAttempt = courseAttempts.find((a) => a.status === "IN_PROGRESS") ?? null;
    const certificate = certificates.find((c) => c.courseId === e.courseId) ?? null;
    return { ...e, courseAttempts, bestAttempt, inProgressAttempt, certificate };
  });

  const passedAttempts = attempts.filter((a) => a.status === "PASSED").length;
  const failedAttempts = attempts.filter((a) => a.status === "FAILED").length;
  const inProgressAttempts = attempts.filter((a) => a.status === "IN_PROGRESS").length;
  const completedCourses = enrollments.filter((e) => e.completedAt).length;
  const scores = attempts.filter((a) => a.scorePercent !== null).map((a) => a.scorePercent);
  const bestScore = scores.length ? Math.max(...scores) : null;

  return res.json({
    learner,
    enrollments: enrichedEnrollments,
    attempts,
    certificates,
    summary: {
      totalCourses: enrollments.length,
      completedCourses,
      passedAttempts,
      failedAttempts,
      inProgressAttempts,
      bestScore,
      hasCertificate: certificates.length > 0,
    },
  });
});

router.get("/public/config/:organizationSlug", async (req, res) => {
  const org = await db.organization.findUnique({ where: { slug: req.params.organizationSlug } });
  if (!org) {
    return res.status(404).json({ error: "Organization not found" });
  }

  const activeCourse = await db.course.findFirst({
    where: { organizationId: org.id, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return res.json({
    organization: { name: org.name, slug: org.slug },
    activeCourse: activeCourse
      ? { code: activeCourse.code, title: activeCourse.title, version: activeCourse.version }
      : null,
  });
});

export default router;
