import { useState } from 'react';
import { X, File as FileIcon, Image as ImageIcon, FileText, ArrowRight, ArrowDown, Download, Loader2 } from 'lucide-react';
import type { RecordFile } from '@/types';

interface MergeModalProps {
  open: boolean;
  onClose: () => void;
  files: RecordFile[];
  recordTitle: string;
}

function getFileUrl(path: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/archive-files/${path}`;
}

function isImageFile(file: RecordFile): boolean {
  return file.file_type?.startsWith('image/') ?? false;
}

function isTextFile(file: RecordFile): boolean {
  const t = file.file_type ?? '';
  return t.startsWith('text/') || /\.(txt|md|csv|json|xml|html?|css|js|ts)$/i.test(file.file_name);
}

export default function MergeModal({ open, onClose, files, recordTitle }: MergeModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const [mergedName, setMergedName] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setMergedUrl(null);
    setError('');
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const arr = [...selected];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    setSelected(arr);
  };

  const moveDown = (idx: number) => {
    if (idx === selected.length - 1) return;
    const arr = [...selected];
    [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
    setSelected(arr);
  };

  const selectedFiles = selected
    .map((id) => files.find((f) => f.id === id))
    .filter((f): f is RecordFile => f !== undefined);

  const handleMerge = async () => {
    if (selectedFiles.length < 2) {
      setError('اختر ملفين على الأقل');
      return;
    }
    setMerging(true);
    setError('');
    try {
      const allText: string[] = [];
      for (const f of selectedFiles) {
        if (isTextFile(f)) {
          const res = await fetch(getFileUrl(f.file_path));
          const text = await res.text();
          allText.push(`=== ${f.file_name} ===\n${text}\n\n`);
        }
      }

      if (allText.length === 0) {
        setError('لا يمكن دمج هذه الملفات. يدعم الدمج الملفات النصية فقط.');
        setMerging(false);
        return;
      }

      const merged = allText.join('');
      const blob = new Blob([merged], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      setMergedUrl(url);
      setMergedName(`${recordTitle}_merged.txt`);
    } catch {
      setError('فشل الدمج');
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/90 px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-bold text-slate-800">دمج الملفات</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          <p className="text-sm text-slate-500">
            اختر الملفات النصية التي تريد دمجها. سيتم إنشاء ملف نصي واحد يحتوي على محتوى جميع الملفات المحددة بالترتيب.
          </p>

          {/* File selection */}
          <div className="space-y-2">
            {files.map((f) => {
              const isSelected = selected.includes(f.id);
              const orderIdx = isSelected ? selected.indexOf(f.id) : -1;
              return (
                <div
                  key={f.id}
                  className={`flex items-center gap-3 rounded-xl p-3 transition ring-1 ${
                    isSelected ? 'bg-blue-50 ring-blue-200' : 'bg-slate-50 ring-slate-100 hover:ring-slate-200'
                  }`}
                >
                  <button
                    onClick={() => toggle(f.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                      isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                    }`}
                  >
                    {isSelected && <span className="text-xs text-white">✓</span>}
                  </button>
                  {isImageFile(f) ? <ImageIcon size={16} className="shrink-0 text-slate-400" /> : <FileText size={16} className="shrink-0 text-slate-400" />}
                  <span className="flex-1 truncate text-sm font-medium text-slate-700">{f.file_name}</span>
                  {isSelected && (
                    <div className="flex items-center gap-1">
                      <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-600">{orderIdx + 1}</span>
                      <button onClick={() => moveUp(orderIdx)} disabled={orderIdx === 0} className="rounded p-1 text-slate-400 transition hover:bg-slate-200 disabled:opacity-30">
                        <ArrowRight size={14} className="rotate-90" />
                      </button>
                      <button onClick={() => moveDown(orderIdx)} disabled={orderIdx === selected.length - 1} className="rounded p-1 text-slate-400 transition hover:bg-slate-200 disabled:opacity-30">
                        <ArrowDown size={14} className="rotate-180" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Merged result */}
          {mergedUrl && (
            <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-700">تم الدمج بنجاح</span>
              </div>
              <a
                href={mergedUrl}
                download={mergedName}
                className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                <Download size={16} />
                تحميل الملف المدمج
              </a>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <button onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
              إلغاء
            </button>
            <button
              onClick={handleMerge}
              disabled={merging || selected.length < 2}
              className="flex items-center gap-2 rounded-xl bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-700 disabled:opacity-50"
            >
              {merging && <Loader2 size={16} className="animate-spin" />}
              {merging ? 'جاري الدمج...' : 'دمج الملفات'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
