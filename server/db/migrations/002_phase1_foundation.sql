-- Phase 1: categories tree, priority, audit log. Safe on an existing database (keeps all rows and ids).

-- ---------- Categories: top-level categories with optional sub-types ----------
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_id        INT REFERENCES categories(id),
  ADD COLUMN IF NOT EXISTS default_priority complaint_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sort_order       INT NOT NULL DEFAULT 100;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

INSERT INTO departments (name) VALUES ('Roads & Civil'), ('Sanitation'), ('Electrical'), ('Water & Sewerage')
ON CONFLICT (name) DO NOTHING;

-- Top-level categories (existing rows with the same slug are relabelled, ids preserved)
INSERT INTO categories (slug, label, icon, department_id, sla_hours, default_priority, sort_order, parent_id)
SELECT v.slug, v.label, v.icon, d.id, v.sla, v.pri::complaint_priority, v.ord, NULL
FROM (VALUES
  ('roads',                'Roads',                '🛣️', 'Roads & Civil',    72,  'medium', 10),
  ('garbage',              'Garbage',              '🗑️', 'Sanitation',       24,  'medium', 20),
  ('water',                'Water',                '💧', 'Water & Sewerage', 24,  'high',   30),
  ('sewage',               'Sewage',               '🚰', 'Water & Sewerage', 24,  'high',   40),
  ('streetlight',          'Street Lights',        '💡', 'Electrical',       48,  'medium', 50),
  ('electricity',          'Electricity',          '⚡', 'Electrical',       24,  'high',   60),
  ('parks',                'Parks',                '🌳', NULL,               168, 'low',    70),
  ('stray_animals',        'Stray Animals',        '🐕', 'Sanitation',       48,  'medium', 80),
  ('illegal_construction', 'Illegal Construction', '🏗️', NULL,               168, 'medium', 90),
  ('public_transport',     'Public Transport',     '🚌', NULL,               96,  'medium', 100),
  ('other',                'Other',                '📍', NULL,               96,  'low',    110)
) AS v(slug, label, icon, dept, sla, pri, ord)
LEFT JOIN departments d ON d.name = v.dept
ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label, icon = EXCLUDED.icon, parent_id = NULL,
  default_priority = EXCLUDED.default_priority, sort_order = EXCLUDED.sort_order;

-- Sub-types (the original fine-grained categories become children)
INSERT INTO categories (slug, label, icon, department_id, sla_hours, default_priority, sort_order, parent_id)
SELECT v.slug, v.label, v.icon, d.id, v.sla, v.pri::complaint_priority, v.ord, (SELECT id FROM categories WHERE slug = v.parent)
FROM (VALUES
  ('pothole',         'Pothole',           '🕳️', 'roads',   'Roads & Civil',    72, 'high',   11),
  ('road_damage',     'Damaged road',      '🛣️', 'roads',   'Roads & Civil',    96, 'medium', 12),
  ('open_manhole',    'Open manhole',      '⚠️', 'sewage',  'Water & Sewerage', 24, 'high',   43),
  ('illegal_dumping', 'Illegal dumping',   '🚯', 'garbage', 'Sanitation',       48, 'medium', 21),
  ('water_leak',      'Water leakage',     '💧', 'water',   'Water & Sewerage', 24, 'medium', 31),
  ('sewer',           'Overflowing sewer', '🚰', 'sewage',  'Water & Sewerage', 24, 'high',   41),
  ('drainage',        'Drainage blockage', '🌊', 'sewage',  'Water & Sewerage', 48, 'medium', 42)
) AS v(slug, label, icon, parent, dept, sla, pri, ord)
LEFT JOIN departments d ON d.name = v.dept
ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label, icon = EXCLUDED.icon, parent_id = EXCLUDED.parent_id,
  default_priority = EXCLUDED.default_priority, sort_order = EXCLUDED.sort_order;

-- ---------- Priority: smallint -> LOW/MEDIUM/HIGH/CRITICAL ----------
DROP VIEW IF EXISTS v_complaint_metrics;       -- a view blocks changing the column type
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_priority_check;
ALTER TABLE complaints ALTER COLUMN priority DROP DEFAULT;
ALTER TABLE complaints ALTER COLUMN priority TYPE complaint_priority
  USING (CASE priority WHEN 1 THEN 'low' WHEN 3 THEN 'high' ELSE 'medium' END)::complaint_priority;
ALTER TABLE complaints ALTER COLUMN priority SET DEFAULT 'medium';
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS priority_suggested complaint_priority,   -- what the citizen thought (never CRITICAL)
  ADD COLUMN IF NOT EXISTS priority_source    TEXT NOT NULL DEFAULT 'rule' CHECK (priority_source IN ('rule','admin','ai'));
CREATE INDEX IF NOT EXISTS idx_c_category      ON complaints(category_id);
CREATE INDEX IF NOT EXISTS idx_c_priority_stat ON complaints(priority, status);

-- Metrics view (rejected complaints never count as SLA breaches)
CREATE VIEW v_complaint_metrics AS
SELECT c.*,
  EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 3600 AS resolution_hours,
  (c.status <> 'rejected' AND COALESCE(c.resolved_at, now()) > c.sla_due_at) AS sla_breached
FROM complaints c;

-- ---------- Audit log ----------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,                 -- e.g. 'complaint.priority_changed'
  target_type TEXT NOT NULL,
  target_id   TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_target  ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
