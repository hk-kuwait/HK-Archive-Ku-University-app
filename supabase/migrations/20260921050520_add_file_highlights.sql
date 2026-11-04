/*
# Add highlights table for file annotations

## Purpose
Store highlighted text selections from files, so users can mark important passages
and they persist across sessions.

## New Tables

### file_highlights
- `id` (uuid, primary key)
- `file_id` (uuid, references record_files ON DELETE CASCADE)
- `record_id` (uuid, references archive_records ON DELETE CASCADE)
- `selected_text` (text, not null) — the highlighted text
- `note` (text) — optional note about why it's important
- `color` (text, default 'yellow') — highlight color
- `page` (integer) — page number if applicable
- `created_at` (timestamptz, default now())

## Security
- RLS enabled, single-tenant: anon + authenticated full CRUD
*/

CREATE TABLE IF NOT EXISTS file_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES record_files(id) ON DELETE CASCADE,
  record_id uuid NOT NULL REFERENCES archive_records(id) ON DELETE CASCADE,
  selected_text text NOT NULL,
  note text,
  color text NOT NULL DEFAULT 'yellow',
  page integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_highlights_file_id ON file_highlights(file_id);
CREATE INDEX IF NOT EXISTS idx_file_highlights_record_id ON file_highlights(record_id);

ALTER TABLE file_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_file_highlights" ON file_highlights;
CREATE POLICY "anon_select_file_highlights" ON file_highlights FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_file_highlights" ON file_highlights;
CREATE POLICY "anon_insert_file_highlights" ON file_highlights FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_file_highlights" ON file_highlights;
CREATE POLICY "anon_update_file_highlights" ON file_highlights FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_file_highlights" ON file_highlights;
CREATE POLICY "anon_delete_file_highlights" ON file_highlights FOR DELETE
  TO anon, authenticated USING (true);
