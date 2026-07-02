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

export default router;
