import express from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword } from "../lib/auth.js";
import { sendEmail } from "../lib/email.js";

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

const courseCreateSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(2),
  courseType: z.string().min(2).default("Compliance"),
  version: z.string().min(1),
  passPercent: z.number().int().min(0).max(100).default(80),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
});

const userCreateSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "STAFF"]),
});

const userUpdateSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "STAFF"]),
  newPassword: z.string().min(8).optional(),
});

function isOwner(req) {
  return req.user.role === "OWNER";
}

function parseOptionalIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const AUTO_ENROLLMENT_CORE_CODES = [
  "ANNUAL-COMPLIANCE-CORE",
  "ABUSE-NEGLECT-ANNUAL",
  "WORKPLACE-VIOLENCE-ANNUAL",
  "HIPAA-PRIVACY-ANNUAL",
  "PATIENT-RIGHTS-ANNUAL",
  "INCIDENT-REPORTING-ANNUAL",
  "CYBERSECURITY-PHISHING-ANNUAL",
  "CULTURAL-COMPETENCY-ANNUAL",
  "FIRE-LIFE-SAFETY-ANNUAL",
];

const AUTO_ENROLLMENT_DEPARTMENT_RULES = [
  {
    keywords: ["behavioral", "psychi", "mental", "clinical"],
    codes: [
      "DEESCALATION-ANNUAL",
      "RESTRAINT-SECLUSION-ANNUAL",
      "INFECTION-CONTROL-ANNUAL",
      "BLOODBORNE-PATHOGENS-ANNUAL",
      "HAZARD-COMM-ANNUAL",
    ],
  },
  {
    keywords: ["nursing", "nurse", "patient care", "med surg", "med-surg"],
    codes: [
      "INFECTION-CONTROL-ANNUAL",
      "BLOODBORNE-PATHOGENS-ANNUAL",
      "HAZARD-COMM-ANNUAL",
      "DEESCALATION-ANNUAL",
    ],
  },
  {
    keywords: ["emergency", "ed", "triage"],
    codes: [
      "EMTALA-AWARENESS-ANNUAL",
      "DEESCALATION-ANNUAL",
      "RESTRAINT-SECLUSION-ANNUAL",
      "INFECTION-CONTROL-ANNUAL",
      "BLOODBORNE-PATHOGENS-ANNUAL",
    ],
  },
  {
    keywords: ["security", "facilities", "maintenance", "environmental", "evs", "housekeeping"],
    codes: [
      "OSHA-SAFETY-ANNUAL",
      "HAZARD-COMM-ANNUAL",
      "DEESCALATION-ANNUAL",
    ],
  },
  {
    keywords: ["leadership", "director", "manager", "supervisor"],
    codes: [
      "EMTALA-AWARENESS-ANNUAL",
      "OSHA-SAFETY-ANNUAL",
    ],
  },
  {
    keywords: ["registration", "admitting", "front desk", "intake"],
    codes: [
      "EMTALA-AWARENESS-ANNUAL",
      "HAZARD-COMM-ANNUAL",
    ],
  },
];

const AUTO_ENROLLMENT_CODE_SET = Array.from(new Set([
  ...AUTO_ENROLLMENT_CORE_CODES,
  ...AUTO_ENROLLMENT_DEPARTMENT_RULES.flatMap((rule) => rule.codes),
]));

function normalizeDeptLabel(value) {
  return (value || "").toLowerCase().trim();
}

function resolveAutoEnrollmentCodes(department) {
  const dept = normalizeDeptLabel(department);
  const selected = new Set(AUTO_ENROLLMENT_CORE_CODES);

  AUTO_ENROLLMENT_DEPARTMENT_RULES.forEach((rule) => {
    const match = rule.keywords.some((keyword) => dept.includes(keyword));
    if (match) {
      rule.codes.forEach((code) => selected.add(code));
    }
  });

  return Array.from(selected);
}

async function autoEnrollNewHireCourses(organizationId, learnerId, department, activeCourseByCode = null) {
  const targetCodes = resolveAutoEnrollmentCodes(department);
  if (!targetCodes.length) return 0;

  let courseMap = activeCourseByCode;
  if (!courseMap) {
    const activeCourses = await db.course.findMany({
      where: {
        organizationId,
        isActive: true,
        code: { in: AUTO_ENROLLMENT_CODE_SET },
      },
      select: { id: true, code: true },
    });
    courseMap = new Map(activeCourses.map((course) => [course.code, course]));
  }

  let enrolledCount = 0;
  for (const code of targetCodes) {
    const course = courseMap.get(code);
    if (!course) continue;

    await db.enrollment.upsert({
      where: {
        organizationId_learnerId_courseId: {
          organizationId,
          learnerId,
          courseId: course.id,
        },
      },
      update: {},
      create: {
        organizationId,
        learnerId,
        courseId: course.id,
      },
    });

    enrolledCount += 1;
  }

  return enrolledCount;
}

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

  const autoEnrolled = await autoEnrollNewHireCourses(
    req.user.organizationId,
    learner.id,
    learner.department
  );

  return res.status(201).json({ ...learner, autoEnrolled });
});

router.get("/learners", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const cursorId = req.query.cursor || null;

  const rows = await db.learner.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]?.id : null;

  return res.json({ data, nextCursor, hasMore });
});

router.post("/learners/bulk", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const schema = z.array(learnerSchema).min(1).max(500);
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  let created = 0;
  let skipped = 0;
  let autoEnrolled = 0;

  const activeCourses = await db.course.findMany({
    where: {
      organizationId: req.user.organizationId,
      isActive: true,
      code: { in: AUTO_ENROLLMENT_CODE_SET },
    },
    select: { id: true, code: true },
  });
  const activeCourseByCode = new Map(activeCourses.map((course) => [course.code, course]));

  for (const row of parsed.data) {
    const email = row.email.toLowerCase();
    const existing = await db.learner.findFirst({
      where: {
        organizationId: req.user.organizationId,
        email,
      },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const learner = await db.learner.create({
      data: {
        ...row,
        email,
        organizationId: req.user.organizationId,
      },
    });
    autoEnrolled += await autoEnrollNewHireCourses(
      req.user.organizationId,
      learner.id,
      learner.department,
      activeCourseByCode
    );
    created += 1;
  }

  return res.status(201).json({ created, skipped, autoEnrolled });
});

router.patch("/learners/:id", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const parsed = learnerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const learner = await db.learner.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!learner) {
    return res.status(404).json({ error: "Learner not found" });
  }

  const updated = await db.learner.update({
    where: { id: learner.id },
    data: {
      fullName: parsed.data.fullName,
      email: parsed.data.email.toLowerCase(),
      employeeId: parsed.data.employeeId || null,
      department: parsed.data.department || null,
      roleTrack: parsed.data.roleTrack || null,
    },
  });

  return res.json(updated);
});

router.delete("/learners/:id", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const learner = await db.learner.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!learner) {
    return res.status(404).json({ error: "Learner not found" });
  }

  await db.learner.delete({ where: { id: learner.id } });
  return res.status(204).send();
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

router.post("/enrollments/bulk", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const schema = z.object({
    courseId: z.string(),
    learnerIds: z.union([z.literal("all"), z.array(z.string()).min(1)]),
    dueDate: z.string().datetime().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  let learnerIds = parsed.data.learnerIds;
  if (learnerIds === "all") {
    const learners = await db.learner.findMany({
      where: { organizationId: req.user.organizationId },
      select: { id: true },
    });
    learnerIds = learners.map((row) => row.id);
  }

  let created = 0;
  let updated = 0;

  for (const learnerId of learnerIds) {
    const result = await db.enrollment.upsert({
      where: {
        organizationId_learnerId_courseId: {
          organizationId: req.user.organizationId,
          learnerId,
          courseId: parsed.data.courseId,
        },
      },
      update: {
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      },
      create: {
        organizationId: req.user.organizationId,
        learnerId,
        courseId: parsed.data.courseId,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      },
    });

    if (result.enrolledAt.getTime() === result.updatedAt?.getTime?.()) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  return res.json({ created, updated });
});

router.post("/enrollments/bulk-due-date", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const schema = z.object({
    courseId: z.string(),
    dueDate: z.string().datetime(),
    incompleteOnly: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const where = {
    organizationId: req.user.organizationId,
    courseId: parsed.data.courseId,
    ...(parsed.data.incompleteOnly ? { completedAt: null } : {}),
  };

  const result = await db.enrollment.updateMany({
    where,
    data: { dueDate: new Date(parsed.data.dueDate) },
  });

  return res.json({ updated: result.count });
});

router.get("/enrollments", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const rows = await db.enrollment.findMany({
    where: { organizationId: req.user.organizationId },
    include: {
      learner: true,
      course: true,
      courseAttempts: {
        where: { status: "PASSED" },
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });

  const payload = rows.map((row) => ({
    ...row,
    passAttemptId: row.courseAttempts[0]?.id || null,
  }));

  return res.json(payload);
});

router.patch("/enrollments/:id", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const schema = z.object({ dueDate: z.string().datetime().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const enrollment = await db.enrollment.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!enrollment) {
    return res.status(404).json({ error: "Enrollment not found" });
  }

  const updated = await db.enrollment.update({
    where: { id: enrollment.id },
    data: { dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null },
  });

  return res.json(updated);
});

router.patch("/enrollments/:id/complete", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const enrollment = await db.enrollment.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!enrollment) {
    return res.status(404).json({ error: "Enrollment not found" });
  }

  const updated = await db.enrollment.update({
    where: { id: enrollment.id },
    data: { completedAt: new Date() },
  });

  return res.json(updated);
});

router.delete("/enrollments/:id", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const enrollment = await db.enrollment.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!enrollment) {
    return res.status(404).json({ error: "Enrollment not found" });
  }

  await db.enrollment.delete({ where: { id: enrollment.id } });
  return res.status(204).send();
});

router.post("/enrollments/:id/remind", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const enrollment = await db.enrollment.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: { learner: true, course: true },
  });
  if (!enrollment) {
    return res.status(404).json({ error: "Enrollment not found" });
  }

  const sent = await sendEmail({
    to: enrollment.learner.email,
    subject: `Training reminder: ${enrollment.course.title}`,
    html: `<p>Hi ${enrollment.learner.fullName},</p><p>This is a reminder to complete <strong>${enrollment.course.title}</strong>.</p>`,
  });

  if (!sent) {
    return res.json({ message: "Reminder generated. Email service is not configured." });
  }

  return res.json({ message: "Reminder sent." });
});

router.post("/reminders/send", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const overdue = await db.enrollment.findMany({
    where: {
      organizationId: req.user.organizationId,
      completedAt: null,
      dueDate: { lt: new Date() },
    },
    include: { learner: true, course: true },
  });

  for (const enrollment of overdue) {
    await sendEmail({
      to: enrollment.learner.email,
      subject: `Overdue training reminder: ${enrollment.course.title}`,
      html: `<p>Hi ${enrollment.learner.fullName},</p><p>Your training <strong>${enrollment.course.title}</strong> is overdue. Please complete it as soon as possible.</p>`,
    });
  }

  return res.json({ sent: overdue.length });
});

router.get("/settings", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const org = await db.organization.findUnique({ where: { id: req.user.organizationId } });
  if (!org) {
    return res.status(404).json({ error: "Organization not found" });
  }

  return res.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl,
    brandColor: org.brandColor,
  });
});

router.patch("/settings", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    logoUrl: z.string().url().nullable().optional(),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const updated = await db.organization.update({
    where: { id: req.user.organizationId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.logoUrl !== undefined ? { logoUrl: parsed.data.logoUrl } : {}),
      ...(parsed.data.brandColor !== undefined ? { brandColor: parsed.data.brandColor } : {}),
    },
  });

  return res.json(updated);
});

router.get("/courses", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const rows = await db.course.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
  });
  return res.json(rows);
});

router.post("/courses", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  const parsed = courseCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const course = await db.course.create({
    data: {
      code: parsed.data.code,
      title: parsed.data.title,
      courseType: parsed.data.courseType || "Compliance",
      version: parsed.data.version,
      passPercent: parsed.data.passPercent,
      opensAt: parseOptionalIso(parsed.data.opensAt),
      closesAt: parseOptionalIso(parsed.data.closesAt),
      organizationId: req.user.organizationId,
    },
  });

  return res.status(201).json(course);
});

router.patch("/courses/:id", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  const schema = z.object({
    title: z.string().min(2).optional(),
    courseType: z.string().min(2).optional(),
    passPercent: z.number().int().min(0).max(100).optional(),
    opensAt: z.string().datetime().nullable().optional(),
    closesAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const course = await db.course.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }

  const updated = await db.course.update({
    where: { id: course.id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.courseType !== undefined ? { courseType: parsed.data.courseType } : {}),
      ...(parsed.data.passPercent !== undefined ? { passPercent: parsed.data.passPercent } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(parsed.data.opensAt !== undefined ? { opensAt: parseOptionalIso(parsed.data.opensAt) } : {}),
      ...(parsed.data.closesAt !== undefined ? { closesAt: parseOptionalIso(parsed.data.closesAt) } : {}),
    },
  });

  return res.json(updated);
});

router.delete("/courses/:id", requireRole(["OWNER", "ADMIN"]), async (req, res) => {
  const course = await db.course.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }

  const enrollments = await db.enrollment.count({ where: { courseId: course.id } });
  if (enrollments > 0) {
    return res.status(400).json({ error: "Cannot delete course with enrollments" });
  }

  await db.course.delete({ where: { id: course.id } });
  return res.status(204).send();
});

router.get("/users", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const rows = await db.user.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
  return res.json(rows);
});

router.post("/users", requireRole(["OWNER"]), async (req, res) => {
  const parsed = userCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const created = await db.user.create({
    data: {
      organizationId: req.user.organizationId,
      fullName: parsed.data.fullName,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      passwordHash,
    },
    select: { id: true, fullName: true, email: true, role: true, isActive: true, createdAt: true },
  });

  return res.status(201).json(created);
});

router.patch("/users/:id", requireRole(["OWNER"]), async (req, res) => {
  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const user = await db.user.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      fullName: parsed.data.fullName,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      ...(parsed.data.newPassword ? { passwordHash: await hashPassword(parsed.data.newPassword) } : {}),
    },
    select: { id: true, fullName: true, email: true, role: true, isActive: true, createdAt: true },
  });

  return res.json(updated);
});

router.patch("/users/:id/toggle-active", requireRole(["OWNER"]), async (req, res) => {
  const user = await db.user.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.id === req.user.sub) {
    return res.status(400).json({ error: "You cannot deactivate your own account" });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: { isActive: !user.isActive },
    select: { id: true, fullName: true, email: true, role: true, isActive: true, createdAt: true },
  });

  return res.json(updated);
});

router.delete("/users/:id", requireRole(["OWNER"]), async (req, res) => {
  const user = await db.user.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.id === req.user.sub) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  if (user.role === "OWNER") {
    const ownerCount = await db.user.count({
      where: { organizationId: req.user.organizationId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return res.status(400).json({ error: "Cannot delete the last OWNER account" });
    }
  }

  await db.user.delete({ where: { id: user.id } });
  return res.status(204).send();
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

router.post("/certificates/:id/email", requireRole(["OWNER", "ADMIN", "MANAGER"]), async (req, res) => {
  const cert = await db.certificate.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: { learner: true, course: true },
  });
  if (!cert) {
    return res.status(404).json({ error: "Certificate not found" });
  }

  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  const certUrl = appUrl ? `${appUrl}/certificate.html?id=${encodeURIComponent(cert.id)}` : null;

  const sent = await sendEmail({
    to: cert.learner.email,
    subject: `Your certificate for ${cert.course.title}`,
    html: `<p>Hi ${cert.learner.fullName},</p><p>Your certificate is ready.</p>${certUrl ? `<p><a href="${certUrl}">View certificate</a></p>` : ""}`,
  });

  if (!sent) {
    return res.json({ message: "Email service is not configured. Certificate remains available in Admin." });
  }

  return res.json({ message: "Certificate emailed." });
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

export default router;
