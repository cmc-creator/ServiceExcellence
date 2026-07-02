import express from "express";
import { db } from "../lib/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth, requireRole(["OWNER", "ADMIN", "MANAGER"]));

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

router.get("/mastery/abuse-neglect", async (req, res) => {
  const orgId = req.user.organizationId;
  const events = await db.trainingEvent.findMany({
    where: {
      organizationId: orgId,
      verb: "completed-training",
    },
    select: {
      attemptId: true,
      payload: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

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

  const byRole = new Map();
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

    if (!byRole.has(roleTrack)) {
      byRole.set(roleTrack, {
        roleTrack,
        attempts: 0,
        masteredCount: 0,
        masteryPctTotal: 0,
        requiredThreshold,
      });
    }

    const row = byRole.get(roleTrack);
    row.attempts += 1;
    row.masteredCount += mastered ? 1 : 0;
    row.masteryPctTotal += abuseNeglectPct;
    row.requiredThreshold = requiredThreshold;
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

export default router;
