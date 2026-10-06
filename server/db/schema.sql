-- MohallaFix schema (PostgreSQL 14+)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('citizen', 'worker', 'admin');
CREATE TYPE complaint_status AS ENUM (
  'submitted', 'assigned', 'worker_notified', 'in_progress',
  'resolved', 'verified', 'reopened'
);

-- Colonies / wards / blocks. Tenant-like unit for RWAs, campuses, towns.
CREATE TABLE areas (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION
);

CREATE TABLE departments (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE            -- e.g. Electrical, Sanitation, Roads, Water
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'citizen',
  department_id INT REFERENCES departments(id),   -- workers only
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Category -> default department + SLA hours
CREATE TABLE categories (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,            -- 'pothole'
  label         TEXT NOT NULL,
  icon          TEXT,
  department_id INT REFERENCES departments(id),
  sla_hours     INT NOT NULL DEFAULT 72
);

CREATE SEQUENCE complaint_no_seq START 10001;

CREATE TABLE complaints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_no  INT NOT NULL UNIQUE DEFAULT nextval('complaint_no_seq'),
  -- public ID shown to citizens, e.g. MH10293
  public_id     TEXT GENERATED ALWAYS AS ('MH' || complaint_no::text) STORED,
  citizen_id    UUID NOT NULL REFERENCES users(id),
  category_id   INT  NOT NULL REFERENCES categories(id),
  area_id       INT  REFERENCES areas(id),
  description   TEXT CHECK (char_length(description) <= 500),
  lat           DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng           DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  address_text  TEXT,                            -- reverse-geocoded, best effort
  location_source TEXT NOT NULL DEFAULT 'gps' CHECK (location_source IN ('gps','manual')),
  status        complaint_status NOT NULL DEFAULT 'submitted',
  assigned_worker_id UUID REFERENCES users(id),
  department_id INT REFERENCES departments(id),
  priority      SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  sla_due_at    TIMESTAMPTZ NOT NULL,
  duplicate_of  UUID REFERENCES complaints(id),  -- repeat/duplicate linking
  upvotes       INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  verified_at   TIMESTAMPTZ
);
CREATE INDEX idx_c_status   ON complaints(status);
CREATE INDEX idx_c_citizen  ON complaints(citizen_id);
CREATE INDEX idx_c_worker   ON complaints(assigned_worker_id) WHERE status NOT IN ('verified');
CREATE INDEX idx_c_geo      ON complaints(lat, lng);
CREATE INDEX idx_c_area_cat ON complaints(area_id, category_id);
CREATE INDEX idx_c_sla      ON complaints(sla_due_at) WHERE status NOT IN ('resolved','verified');

-- Photos: before (citizen), after (worker), verification (citizen)
CREATE TABLE complaint_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL CHECK (kind IN ('before','after','verification')),
  url          TEXT NOT NULL,
  public_id    TEXT,                             -- Cloudinary id for deletion
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable audit trail; drives the citizen-facing timeline
CREATE TABLE complaint_events (
  id           BIGSERIAL PRIMARY KEY,
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES users(id),
  from_status  complaint_status,
  to_status    complaint_status NOT NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_e_complaint ON complaint_events(complaint_id, created_at);

-- Admin/worker-only notes (never returned to citizens)
CREATE TABLE internal_notes (
  id           BIGSERIAL PRIMARY KEY,
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE verifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
  citizen_id   UUID NOT NULL REFERENCES users(id),
  is_resolved  BOOLEAN NOT NULL,                 -- Yes / No
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE complaint_upvotes (                 -- "me too" instead of duplicates
  complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (complaint_id, user_id)
);

-- Analytics helper view
CREATE VIEW v_complaint_metrics AS
SELECT c.*,
  EXTRACT(EPOCH FROM (resolved_at - created_at))/3600 AS resolution_hours,
  (resolved_at IS NOT NULL AND resolved_at > sla_due_at)
    OR (resolved_at IS NULL AND now() > sla_due_at)   AS sla_breached
FROM complaints c;
