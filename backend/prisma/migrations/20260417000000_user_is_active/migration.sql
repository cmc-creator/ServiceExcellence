-- AlterTable: add isActive column to User, defaulting existing rows to TRUE
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
