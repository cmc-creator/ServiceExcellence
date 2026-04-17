-- Add branding fields to Organization
ALTER TABLE "Organization" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Organization" ADD COLUMN "brandColor" TEXT;

-- Add scheduling fields to Course
ALTER TABLE "Course" ADD COLUMN "opensAt" TIMESTAMP(3);
ALTER TABLE "Course" ADD COLUMN "closesAt" TIMESTAMP(3);
