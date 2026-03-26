-- Add projectGroup column to Project
ALTER TABLE "Project" ADD COLUMN "projectGroup" TEXT NOT NULL DEFAULT 'Forza';
