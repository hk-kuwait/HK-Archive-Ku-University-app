/*
# Add thumbnail path to record files

1. Modified Tables
- `record_files`: new nullable column `thumbnail_path` (text) that stores the storage path of a generated preview image for the file.

2. Security
- No change to RLS policies or grants. The existing anonymous and authenticated policies on `record_files` cover the new column.

3. Important Notes
- Existing rows keep `thumbnail_path` as NULL. Thumbnails are generated lazily in the browser the first time a file card is viewed, so no bulk processing happens.
- No data is deleted, moved, or modified.
*/

ALTER TABLE record_files ADD COLUMN IF NOT EXISTS thumbnail_path text;
