import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/lib/supabase';
import { getFileUrl } from '@/lib/storage';
import type { RecordFile } from '@/types';

const BUCKET = 'archive-files';

export async function downloadBytes(path: string): Promise<Uint8Array> {
  const res = await fetch(getFileUrl(path));
  if (!res.ok) throw new Error(`تعذر تحميل الملف (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Pages are 1-based. */
export async function removePagesFromPdf(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const removed = new Set(pages);
  const keep = doc.getPageIndices().filter((i) => !removed.has(i + 1));
  if (keep.length === 0) throw new Error('لا يمكن حذف كل صفحات الملف، احذف الملف بدلاً من ذلك');
  const out = await PDFDocument.create();
  const copied = await out.copyPages(doc, keep);
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

/** Pages are 1-based. */
export async function appendPagesToPdf(destBytes: Uint8Array, srcBytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const dest = await PDFDocument.load(destBytes);
  const src = await PDFDocument.load(srcBytes);
  const indices = [...pages].sort((a, b) => a - b).map((p) => p - 1);
  const copied = await dest.copyPages(src, indices);
  copied.forEach((p) => dest.addPage(p));
  return dest.save();
}

/**
 * Stores new bytes under a fresh path, points the record at it, then removes the old file and thumbnail.
 * Returns the updated record so callers can chain further edits.
 */
export async function replaceFileContent(file: RecordFile, bytes: Uint8Array): Promise<RecordFile> {
  const newPath = `${file.record_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(newPath, new Blob([bytes], { type: 'application/pdf' }));
  if (upErr) throw upErr;

  const { error: dbErr } = await supabase
    .from('record_files')
    .update({ file_path: newPath, file_size: bytes.byteLength, thumbnail_path: null })
    .eq('id', file.id);
  if (dbErr) {
    await supabase.storage.from(BUCKET).remove([newPath]);
    throw dbErr;
  }

  const stale = [file.file_path, ...(file.thumbnail_path ? [file.thumbnail_path] : [])];
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove(stale);
  if (rmErr) console.error('Failed to remove replaced file:', rmErr);

  return { ...file, file_path: newPath, file_size: bytes.byteLength, thumbnail_path: null };
}
