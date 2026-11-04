/*
# Add file attachments support to archive

## Purpose
Enable file/image uploads for archive records and a storage bucket to hold them.

## New Tables

### record_files
- `id` (uuid, primary key)
- `record_id` (uuid, references archive_records ON DELETE CASCADE)
- `file_name` (text, not null) — original file name
- `file_path` (text, not null) — path in the storage bucket
- `file_type` (text) — MIME type
- `file_size` (bigint) — size in bytes
- `created_at` (timestamptz, default now())

## Storage
- Create bucket `archive-files` (public read, so files can be displayed/downloaded)
- Storage policies: anon + authenticated can read, insert, delete objects in `archive-files`

## Security
- RLS enabled on `record_files`
- Single-tenant: anon + authenticated full CRUD
- Storage bucket policies for public read + authenticated write
*/

CREATE TABLE IF NOT EXISTS record_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES archive_records(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size bigint,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_record_files_record_id ON record_files(record_id);

ALTER TABLE record_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_record_files" ON record_files;
CREATE POLICY "anon_select_record_files" ON record_files FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_record_files" ON record_files;
CREATE POLICY "anon_insert_record_files" ON record_files FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_record_files" ON record_files;
CREATE POLICY "anon_update_record_files" ON record_files FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_record_files" ON record_files;
CREATE POLICY "anon_delete_record_files" ON record_files FOR DELETE
  TO anon, authenticated USING (true);

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('archive-files', 'archive-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "anon_read_archive_files" ON storage.objects;
CREATE POLICY "anon_read_archive_files" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'archive-files');

DROP POLICY IF EXISTS "anon_insert_archive_files" ON storage.objects;
CREATE POLICY "anon_insert_archive_files" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'archive-files');

DROP POLICY IF EXISTS "anon_delete_archive_files" ON storage.objects;
CREATE POLICY "anon_delete_archive_files" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'archive-files');
