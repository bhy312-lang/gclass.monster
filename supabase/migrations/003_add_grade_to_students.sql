-- Add grade column to students table
-- 실행일: 2026-02-03

ALTER TABLE students ADD COLUMN IF NOT EXISTS grade INTEGER;
