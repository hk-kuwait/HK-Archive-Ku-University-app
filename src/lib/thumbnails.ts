import { pdfjsLib } from '@/lib/pdf';
import { getFileUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import type { RecordFile } from '@/types';

export type ThumbnailSource = 'image' | 'pdf';

const BUCKET = 'archive-files';
const THUMB_SIZE = 320;
const THUMB_QUALITY = 0.8;
const MAX_CONCURRENT = 2;

let running = 0;
const waiting: (() => void)[] = [];
const inFlight = new Map<string, Promise<string>>();

function acquireSlot(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(() => { running++; resolve(); }));
}

function releaseSlot() {
  running--;
  waiting.shift()?.();
}

function thumbScale(width: number, height: number): number {
  return Math.min(1, THUMB_SIZE / Math.max(width, height));
}

function createWhiteCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Thumbnail encoding failed'))),
      'image/jpeg',
      THUMB_QUALITY,
    );
  });
}

async function renderImageThumbnail(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  try {
    const scale = thumbScale(bitmap.width, bitmap.height);
    const { canvas, ctx } = createWhiteCanvas(bitmap.width * scale, bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvasToJpeg(canvas);
  } finally {
    bitmap.close();
  }
}

async function renderPdfThumbnail(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const loadingTask = pdfjsLib.getDocument({ data: await res.arrayBuffer() });
  try {
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: thumbScale(base.width, base.height) });
    const { canvas, ctx } = createWhiteCanvas(viewport.width, viewport.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return await canvasToJpeg(canvas);
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Returns the storage path of the file's thumbnail, generating and caching it on first use.
 * Concurrent requests for the same file share one job; at most MAX_CONCURRENT jobs run at once.
 */
export function ensureThumbnail(file: RecordFile, source: ThumbnailSource): Promise<string> {
  const pending = inFlight.get(file.id);
  if (pending) return pending;

  const task = (async () => {
    await acquireSlot();
    try {
      const url = getFileUrl(file.file_path);
      const blob = source === 'pdf' ? await renderPdfThumbnail(url) : await renderImageThumbnail(url);
      const path = `thumbs/${file.id}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from('record_files').update({ thumbnail_path: path }).eq('id', file.id);
      if (dbErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw dbErr;
      }
      return path;
    } finally {
      releaseSlot();
    }
  })();

  inFlight.set(file.id, task);
  task.finally(() => inFlight.delete(file.id)).catch(() => {});
  return task;
}

/** Clears the cached thumbnail after the original file was overwritten; it regenerates on next view. */
export async function invalidateThumbnail(file: RecordFile): Promise<void> {
  if (!file.thumbnail_path) return;
  const oldPath = file.thumbnail_path;
  const { error: dbErr } = await supabase.from('record_files').update({ thumbnail_path: null }).eq('id', file.id);
  if (dbErr) throw dbErr;
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([oldPath]);
  if (rmErr) throw rmErr;
}
