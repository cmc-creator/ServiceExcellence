import express from "express";
import { db } from "../lib/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth, requireRole(["OWNER", "ADMIN", "MANAGER"]));

const MODULE_LIBRARY = [
  { id: "suicide-observation", title: "Suicide Risk and Observation" },
  { id: "trauma-informed", title: "Trauma-Informed Care" },
  { id: "medication-safety", title: "Medication Safety" },
  { id: "workplace-violence", title: "Workplace Violence Prevention" },
  { id: "legal-rights-consent", title: "Legal Rights and Consent" },
];

const MODULE_LABEL_BY_ID = new Map(MODULE_LIBRARY.map((item) => [item.id, item.title]));

function normalizeModuleId(value) {
  return String(value || "").trim().toLowerCase();
}

function inferModuleIdFromLessonTitle(title) {
  const normalized = String(title || "").toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("suicide") || normalized.includes("observation")) return "suicide-observation";
  if (normalized.includes("trauma")) return "trauma-informed";
  if (normalized.includes("medication")) return "medication-safety";
  if (normalized.includes("violence")) return "workplace-violence";
  if (normalized.includes("consent") || normalized.includes("rights")) return "legal-rights-consent";
  return null;
}

function aggregateAbuseNeglectMastery(events) {
  const requiredByPersona = {
    clinical: 85,
    nonclinical: 80,
    leadership: 90,
  };

  const latestByAttempt = new Map();
  for (const evt of events) {
    const key = evt.attemptId || evt.createdAt.toISOString();
    if (!latestByAttempt.has(key)) {
      latestByAttempt.set(key, evt);
    }
  }

  const learnerRows = [];
  for (const evt of latestByAttempt.values()) {
    const payload = evt.payload || {};
    const detail = payload?.detail || {};

    const roleTrack = payload?.roleTrack || "Unknown";
    const rolePersona = payload?.rolePersona || "nonclinical";
    const requiredThreshold = Number(detail?.abuseNeglectThreshold)
      || requiredByPersona[rolePersona]
      || 80;

    const abuseNeglectPct = Number(detail?.abuseNeglectPct);
    if (!Number.isFinite(abuseNeglectPct)) continue;

    const mastered = typeof detail?.abuseNeglectMastered === "boolean"
      ? detail.abuseNeglectMastered
      : abuseNeglectPct >= requiredThreshold;

    learnerRows.push({
      attemptId: evt.attemptId,
      learnerId: evt.learnerId || null,
      learnerName: evt.learner?.fullName || "Unknown Learner",
      learnerEmail: evt.learner?.email || "",
      employeeId: evt.learner?.employeeId || "",
      department: evt.learner?.department || "Unassigned",
      courseCode: evt.course?.code || "",
      courseTitle: evt.course?.title || "",
      courseType: evt.course?.courseType || "Compliance",
      roleTrack,
      rolePersona,
      assessmentPercent: Number(detail?.assessmentPercent),
      abuseNeglectPct,
      requiredThreshold,
      mastered,
      completedAt: evt.createdAt,
    });
  }

  const byRole = new Map();
  for (const row of learnerRows) {
    if (!byRole.has(row.roleTrack)) {
      byRole.set(row.roleTrack, {
        roleTrack: row.roleTrack,
        attempts: 0,
        masteredCount: 0,
        masteryPctTotal: 0,
        requiredThreshold: row.requiredThreshold,
      });
    }

    const agg = byRole.get(row.roleTrack);
    agg.attempts += 1;
    agg.masteredCount += row.mastered ? 1 : 0;
    agg.masteryPctTotal += row.abuseNeglectPct;
    agg.requiredThreshold = row.requiredThreshold;
  }

  const roles = Array.from(byRole.values())
    .map((row) => ({
      roleTrack: row.roleTrack,
      attempts: row.attempts,
      masteredCount: row.masteredCount,
      avgMasteryPct: row.attempts ? Number((row.masteryPctTotal / row.attempts).toFixed(1)) : 0,
      requiredThreshold: row.requiredThreshold,
      masteryRate: row.attempts ? Number(((row.masteredCount / row.attempts) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.attempts - a.attempts);

  return { roles, learnerRows };
}

router.get("/completion", async (req, res) => {
  const orgId = req.user.organizationId;
  const [totalEnrollments, completedEnrollments, passCount, failCount] = await Promise.all([
    db.enrollment.count({ where: { organizationId: orgId } }),
    db.enrollment.count({ where: { organizationId: orgId, completedAt: { not: null } } }),
    db.attempt.count({ where: { organizationId: orgId, status: "PASSED" } }),
    db.attempt.count({ where: { organizationId: orgId, status: "FAILED" } }),
  ]);

  return res.json({
    totalEnrollments,
    completedEnrollments,
    completionRate: totalEnrollments ? Number(((completedEnrollments / totalEnrollments) * 100).toFixed(2)) : 0,
    passCount,
    failCount,
  });
});

router.get("/attempts/recent", async (req, res) => {
  const rows = await db.attempt.findMany({
    where: { organizationId: req.user.organizationId },
    include: {
      learner: true,
      course: true,
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return res.json(rows);
});

router.get("/events/top", async (req, res) => {
  const rows = await db.trainingEvent.groupBy({
    by: ["verb"],
    where: { organizationId: req.user.organizationId },
    _count: { verb: true },
    orderBy: { _count: { verb: "desc" } },
    take: 20,
  });

  return res.json(rows.map((row) => ({ verb: row.verb, count: row._count.verb })));
});

router.get("/trends", async (req, res) => {
  const attempts = await db.attempt.findMany({
    where: {
      organizationId: req.user.organizationId,
      status: "PASSED",
      submittedAt: { not: null },
    },
    select: { submittedAt: true },
    orderBy: { submittedAt: "asc" },
  });

  const grouped = {};
  for (const attempt of attempts) {
    const month = attempt.submittedAt.toISOString().slice(0, 7);
    grouped[month] = (grouped[month] || 0) + 1;
  }

  return res.json(Object.entries(grouped).map(([month, count]) => ({ month, count })));
});

router.get("/by-department", async (req, res) => {
  const enrollments = await db.enrollment.findMany({
    where: { organizationId: req.user.organizationId },
    select: {
      completedAt: true,
      learner: { select: { department: true } },
    },
  });

  const map = {};
  for (const enrollment of enrollments) {
    const department = enrollment.learner?.department || "Unassigned";
    if (!map[department]) {
      map[department] = { total: 0, completed: 0 };
    }
    map[department].total += 1;
    if (enrollment.completedAt) {
      map[department].completed += 1;
    }
  }

  const rows = Object.entries(map)
    .map(([department, stats]) => ({
      department,
      total: stats.total,
      completed: stats.completed,
      rate: stats.total ? Number(((stats.completed / stats.total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return res.json(rows);
});

router.get("/by-course-type", async (req, res) => {
  const orgId = req.user.organizationId;
  const [enrollments, attempts] = await Promise.all([
    db.enrollment.findMany({
      where: { organizationId: orgId },
      select: {
        completedAt: true,
        course: { select: { courseType: true } },
      },
    }),
    db.attempt.findMany({
      where: { organizationId: orgId },
      select: {
        status: true,
        course: { select: { courseType: true } },
      },
    }),
  ]);

  const map = new Map();
  const ensure = (courseType) => {
    const key = courseType || "Compliance";
    if (!map.has(key)) {
      map.set(key, {
        courseType: key,
        totalEnrollments: 0,
        completedEnrollments: 0,
        passCount: 0,
        failCount: 0,
      });
    }
    return map.get(key);
  };

  for (const row of enrollments) {
    const agg = ensure(row.course?.courseType);
    agg.totalEnrollments += 1;
    if (row.completedAt) agg.completedEnrollments += 1;
  }

  for (const row of attempts) {
    const agg = ensure(row.course?.courseType);
    if (row.status === "PASSED") agg.passCount += 1;
    if (row.status === "FAILED") agg.failCount += 1;
  }

  const rows = Array.from(map.values())
    .map((row) => ({
      ...row,
      completionRate: row.totalEnrollments
        ? Number(((row.completedEnrollments / row.totalEnrollments) * 100).toFixed(1))
        : 0,
      passRate: row.passCount + row.failCount
        ? Number((row.passCount / (row.passCount + row.failCount) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.totalEnrollments - a.totalEnrollments);

  return res.json(rows);
});

router.get("/by-module", async (req, res) => {
  const orgId = req.user.organizationId;
  const events = await db.trainingEvent.findMany({
    where: {
      organizationId: orgId,
      verb: { in: ["answered-core-lesson", "completed-training"] },
    },
    select: {
      verb: true,
      payload: true,
    },
  });

  const rowsByModule = new Map();
  const ensure = (moduleId) => {
    const id = normalizeModuleId(moduleId);
    if (!id) return null;
    if (!rowsByModule.has(id)) {
      rowsByModule.set(id, {
        moduleId: id,
        moduleTitle: MODULE_LABEL_BY_ID.get(id) || id,
        lessonAttempts: 0,
        lessonCorrect: 0,
        completionAttempts: 0,
        passCount: 0,
        failCount: 0,
      });
    }
    return rowsByModule.get(id);
  };

  for (const evt of events) {
    const payload = evt.payload || {};
    const detail = payload?.detail || {};

    if (evt.verb === "answered-core-lesson") {
      const directModuleId = normalizeModuleId(detail?.moduleId);
      const inferredModuleId = inferModuleIdFromLessonTitle(detail?.lesson);
      const moduleAgg = ensure(directModuleId || inferredModuleId);
      if (!moduleAgg) continue;
      moduleAgg.lessonAttempts += 1;
      if (detail?.good === true) moduleAgg.lessonCorrect += 1;
      continue;
    }

    if (evt.verb === "completed-training") {
      const activeModuleIds = Array.isArray(detail?.activeModuleIds)
        ? detail.activeModuleIds.map((id) => normalizeModuleId(id)).filter(Boolean)
        : [];
      const targetModuleIds = activeModuleIds.length
        ? activeModuleIds
        : MODULE_LIBRARY.map((item) => item.id);

      targetModuleIds.forEach((moduleId) => {
        const moduleAgg = ensure(moduleId);
        if (!moduleAgg) return;
        moduleAgg.completionAttempts += 1;
        if (detail?.pass === true) moduleAgg.passCount += 1;
        if (detail?.pass === false) moduleAgg.failCount += 1;
      });
    }
  }

  const rows = Array.from(rowsByModule.values())
    .map((row) => {
      const gradedAttempts = row.passCount + row.failCount;
      return {
        ...row,
        lessonAccuracyRate: row.lessonAttempts
          ? Number(((row.lessonCorrect / row.lessonAttempts) * 100).toFixed(1))
          : 0,
        completionRate: row.completionAttempts
          ? Number((gradedAttempts / row.completionAttempts * 100).toFixed(1))
          : 0,
        passRate: gradedAttempts
          ? Number((row.passCount / gradedAttempts * 100).toFixed(1))
          : 0,
      };
    })
    .sort((a, b) => b.completionAttempts - a.completionAttempts || b.lessonAttempts - a.lessonAttempts);

  return res.json(rows);
});

router.get("/mastery/abuse-neglect", async (req, res) => {
  const orgId = req.user.organizationId;
  const events = await db.trainingEvent.findMany({
    where: {
      organizationId: orgId,
      verb: "completed-training",
    },
    select: {
      attemptId: true,
      learnerId: true,
      course: {
        select: {
          code: true,
          title: true,
          courseType: true,
        },
      },
      learner: {
        select: {
          fullName: true,
          email: true,
          employeeId: true,
          department: true,
        },
      },
      payload: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const { roles } = aggregateAbuseNeglectMastery(events);

  const totals = roles.reduce(
    (acc, row) => {
      acc.attempts += row.attempts;
      acc.mastered += row.masteredCount;
      return acc;
    },
    { attempts: 0, mastered: 0 }
  );

  return res.json({
    overall: {
      attempts: totals.attempts,
      mastered: totals.mastered,
      masteryRate: totals.attempts
        ? Number(((totals.mastered / totals.attempts) * 100).toFixed(1))
        : 0,
    },
    roles,
  });
});

router.get("/mastery/abuse-neglect/learners", async (req, res) => {
  const orgId = req.user.organizationId;
  const events = await db.trainingEvent.findMany({
    where: {
      organizationId: orgId,
      verb: "completed-training",
    },
    select: {
      attemptId: true,
      learnerId: true,
      course: {
        select: {
          code: true,
          title: true,
          courseType: true,
        },
      },
      learner: {
        select: {
          fullName: true,
          email: true,
          employeeId: true,
          department: true,
        },
      },
      payload: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const { learnerRows } = aggregateAbuseNeglectMastery(events);
  const rows = learnerRows
    .sort((a, b) => {
      if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
      if (a.abuseNeglectPct !== b.abuseNeglectPct) return a.abuseNeglectPct - b.abuseNeglectPct;
      return new Date(b.completedAt) - new Date(a.completedAt);
    })
    .map((row) => ({
      ...row,
      completedAt: row.completedAt.toISOString(),
    }));

  return res.json({
    totalRows: rows.length,
    belowThreshold: rows.filter((row) => !row.mastered).length,
    learners: rows,
  });
});

export default router;
