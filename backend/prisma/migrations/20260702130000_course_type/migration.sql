-- Add course type field for multi-training catalog support
ALTER TABLE "Course" ADD COLUMN "courseType" TEXT NOT NULL DEFAULT 'Compliance';
