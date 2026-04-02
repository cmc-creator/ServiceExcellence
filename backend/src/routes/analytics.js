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

export default router;
