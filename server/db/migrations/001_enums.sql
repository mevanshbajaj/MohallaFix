-- Phase 1: new lifecycle states + priority type.
-- (New enum values cannot be used in the same transaction, so this file only declares them.)
ALTER TYPE complaint_status ADD VALUE IF NOT EXISTS 'under_review';
ALTER TYPE complaint_status ADD VALUE IF NOT EXISTS 'rejected';

DO $$ BEGIN
  CREATE TYPE complaint_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
