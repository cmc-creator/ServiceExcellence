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

const selfEnrollSchema = z.object({
  courseId: z.string(),
});

function requestMatchesOrganization(req, organizationId, organizationSlug) {
  return req.user?.organizationId === organizationId || req.user?.organizationSlug === organizationSlug;
}

async function resolveLearnerForUser(user) {
  let learner = await db.learner.findFirst({
    where: {
      organizationId: user.organizationId,
      OR: [{ userId: user.sub }, { email: user.email.toLowerCase() }],
    },
  });

  if (!learner) {
    const account = await db.user.findUnique({ where: { id: user.sub } });
    learner = await db.learner.create({
      data: {
        organizationId: user.organizationId,
        email: user.email.toLowerCase(),
        fullName: account?.fullName || user.email,
        userId: user.sub,
      },
    });
  }

  return learner;
}

router.get("/me", requireAuth, async (req, res) => {
  const learner = await resolveLearnerForUser(req.user);

  const [enrollmentsRaw, attempts, certificates] = await Promise.all([
    db.enrollment.findMany({
      where: {
        organizationId: req.user.organizationId,
        learnerId: learner.id,
      },
      include: { course: true },
      orderBy: { enrolledAt: "desc" },
    }),
    db.attempt.findMany({
      where: {
        organizationId: req.user.organizationId,
        learnerId: learner.id,
      },
      include: { course: true },
      orderBy: { startedAt: "desc" },
    }),
    db.certificate.findMany({
      where: {
        organizationId: req.user.organizationId,
        learnerId: learner.id,
      },
      include: { course: true },
      orderBy: { issuedAt: "desc" },
    }),
  ]);

  const attemptsByCourse = attempts.reduce((acc, attempt) => {
    if (!acc[attempt.courseId]) {
      acc[attempt.courseId] = [];
    }
    acc[attempt.courseId].push(attempt);
    return acc;
  }, {});

  const certByCourse = certificates.reduce((acc, cert) => {
    if (!acc[cert.courseId]) {
      acc[cert.courseId] = cert;
    }
    return acc;
  }, {});

  const enrollments = enrollmentsRaw.map((enrollment) => {
    const courseAttempts = (attemptsByCourse[enrollment.courseId] || [])
      .slice()
      .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

    const bestAttempt = courseAttempts
      .filter((attempt) => attempt.status === "PASSED")
      .sort((a, b) => (b.scorePercent || 0) - (a.scorePercent || 0))[0] || null;

    const inProgressAttempt = courseAttempts
      .filter((attempt) => attempt.status === "IN_PROGRESS")
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;

    return {
      ...enrollment,
      courseAttempts,
      bestAttempt,
      inProgressAttempt,
      certificate: certByCourse[enrollment.courseId] || null,
    };
  });

  const summary = {
    totalCourses: enrollments.length,
    completedCourses: enrollments.filter((row) => row.completedAt).length,
    inProgressAttempts: attempts.filter((attempt) => attempt.status === "IN_PROGRESS").length,
    failedAttempts: attempts.filter((attempt) => attempt.status === "FAILED").length,
    passedAttempts: attempts.filter((attempt) => attempt.status === "PASSED").length,
    bestScore: attempts.reduce((max, attempt) => {
      if (attempt.scorePercent == null) return max;
      return max == null ? attempt.scorePercent : Math.max(max, attempt.scorePercent);
    }, null),
  };

  return res.json({
    learner,
    summary,
    enrollments,
    attempts,
    certificates,
  });
});

router.get("/available", requireAuth, async (req, res) => {
  const learner = await resolveLearnerForUser(req.user);
  const enrollments = await db.enrollment.findMany({
    where: {
      organizationId: req.user.organizationId,
      learnerId: learner.id,
    },
    select: { courseId: true },
  });

  const enrolledCourseIds = new Set(enrollments.map((row) => row.courseId));
  const courses = await db.course.findMany({
    where: { organizationId: req.user.organizationId, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return res.json(courses.filter((course) => !enrolledCourseIds.has(course.id)));
});

router.post("/self-enroll", requireAuth, async (req, res) => {
  const parsed = selfEnrollSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const learner = await resolveLearnerForUser(req.user);
  const course = await db.course.findFirst({
    where: {
      id: parsed.data.courseId,
      organizationId: req.user.organizationId,
      isActive: true,
    },
  });
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }

  const enrollment = await db.enrollment.upsert({
    where: {
      organizationId_learnerId_courseId: {
        organizationId: req.user.organizationId,
        learnerId: learner.id,
        courseId: course.id,
      },
    },
    update: {},
    create: {
      organizationId: req.user.organizationId,
      learnerId: learner.id,
      courseId: course.id,
    },
  });

  return res.status(201).json(enrollment);
});

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

    // Automatically issue (or reuse) the certificate for the passed attempt.
    certificate = await db.certificate.upsert({
      where: { attemptId: attempt.id },
      update: {},
      create: {
        attemptId: attempt.id,
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
    certificateId: certificate?.id || null,
    certificateNo: certificate?.certificateNo || null,
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
