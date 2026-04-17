import { db } from "../../src/lib/db.js";
import { sendEmail } from "../../src/lib/email.js";

/**
 * Vercel Cron Job — Daily overdue-training reminder emails.
 * Scheduled at 08:00 UTC daily via vercel.json "crons" config.
 *
 * Vercel automatically adds an Authorization: Bearer <CRON_SECRET> header.
 * Set the CRON_SECRET environment variable in the Vercel project settings.
 */
export default async function handler(req, res) {
  // Only allow GET (Vercel cron uses GET)
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify Vercel cron secret to prevent unauthorized invocations
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["authorization"] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const today = new Date();

  // Find all incomplete enrollments with a past due date
  const overdueEnrollments = await db.enrollment.findMany({
    where: {
      completedAt: null,
      dueDate: { not: null, lt: today },
    },
    include: {
      learner: true,
      course: true,
    },
  });

  let sent = 0;
  let failed = 0;

  for (const enrollment of overdueEnrollments) {
    const dueDateStr = new Date(enrollment.dueDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const overdueDays = Math.floor((today - new Date(enrollment.dueDate)) / (1000 * 60 * 60 * 24));

    const ok = await sendEmail({
      to: enrollment.learner.email,
      subject: `Action required: Complete your ${enrollment.course.title} training`,
      html: `<p>Hi ${enrollment.learner.fullName},</p>
<p>This is a reminder that your <strong>${enrollment.course.title}</strong> training was due on <strong>${dueDateStr}</strong> and is now <strong>${overdueDays} day${overdueDays !== 1 ? "s" : ""} overdue</strong>.</p>
<p>Please log in to your training portal and complete this course as soon as possible.</p>
<p>If you have questions, contact your administrator.</p>`,
    });

    if (ok) {
      sent++;
    } else {
      failed++;
    }
  }

  return res.json({
    processed: overdueEnrollments.length,
    sent,
    failed,
    timestamp: new Date().toISOString(),
  });
}
