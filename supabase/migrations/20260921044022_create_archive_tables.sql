/*
# Create archive tables (single-tenant, no auth)

## Purpose
An archive application to store, organize, search, and manage archived records.
Each record has a title, description, category, reference number, date, status, and tags.

## New Tables

### categories
- `id` (uuid, primary key)
- `name` (text, not null, unique) — category name (e.g. "قرارات", "مراسلات", "تقارير")
- `color` (text, not null, default 'slate') — tailwind color name for visual identification
- `icon` (text, default 'folder') — lucide icon name
- `created_at` (timestamptz, default now)

### archive_records
- `id` (uuid, primary key)
- `title` (text, not null) — title of the archived document
- `description` (text) — detailed description / notes
- `reference_number` (text) — official reference / document number
- `category_id` (uuid, references categories, ON DELETE SET NULL)
- `record_date` (date, not null) — date of the archived document
- `status` (text, not null, default 'active') — one of: active, archived, pending, draft
- `tags` (text[]) — array of tags for flexible categorization
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## Indexes
- Index on `category_id` for filter joins
- Index on `status` for status filtering
- Index on `record_date` for date-based queries
- GIN index on `tags` for array containment searches
- Index on `reference_number` for lookups

## Security
- RLS enabled on both tables.
- Single-tenant app (no sign-in): anon + authenticated can perform all CRUD operations.
- Data is intentionally shared/public within the app.
*/

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'slate',
  icon text DEFAULT 'folder',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archive_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  reference_number text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'pending', 'draft')),
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archive_records_category_id ON archive_records(category_id);
CREATE INDEX IF NOT EXISTS idx_archive_records_status ON archive_records(status);
CREATE INDEX IF NOT EXISTS idx_archive_records_record_date ON archive_records(record_date DESC);
CREATE INDEX IF NOT EXISTS idx_archive_records_tags ON archive_records USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_archive_records_reference_number ON archive_records(reference_number);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_archive_records" ON archive_records;
CREATE POLICY "anon_select_archive_records" ON archive_records FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_archive_records" ON archive_records;
CREATE POLICY "anon_insert_archive_records" ON archive_records FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_archive_records" ON archive_records;
CREATE POLICY "anon_update_archive_records" ON archive_records FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_archive_records" ON archive_records;
CREATE POLICY "anon_delete_archive_records" ON archive_records FOR DELETE
  TO anon, authenticated USING (true);

-- Seed default categories
INSERT INTO categories (name, color, icon) VALUES
  ('قرارات', 'blue', 'gavel'),
  ('مراسلات', 'amber', 'mail'),
  ('تقارير', 'emerald', 'file-text'),
  ('عقود', 'purple', 'file-signature'),
  ('صور', 'rose', 'image'),
  ('أخرى', 'slate', 'archive')
ON CONFLICT (name) DO NOTHING;
