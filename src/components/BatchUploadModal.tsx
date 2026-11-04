import { useState, useRef } from 'react';
import {
  X, Upload, File as FileIcon, Image as ImageIcon, Loader2, Trash2,
  Check, AlertCircle, Camera,
} from 'lucide-react';
import type { Category } from '@/types';
import { supabase } from '@/lib/supabase';

interface BatchUploadModalProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onUploaded: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

export default function BatchUploadModal({ open, onClose, categories, onUploaded }: BatchUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setFiles([]);
    setTitle('');
    setCategoryId('');
    setError('');
    setProgress(0);
    setDone(false);
  };

  const handleClose = () => {
    if (!uploading) {
      reset();
      onClose();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const valid: File[] = [];
    for (const f of selected) {
      if (f.size > MAX_FILE_SIZE) {
        setError(`الملف "${f.name}" يتجاوز 10 ميجابايت`);
        continue;
      }
      valid.push(f);
    }
    setFiles([...files, ...valid]);
    if (valid.length > 0) setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles(files.filter((_, i) => i !== idx));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    const valid: File[] = [];
    for (const f of dropped) {
      if (f.size > MAX_FILE_SIZE) {
        setError(`الملف "${f.name}" يتجاوز 10 ميجابايت`);
        continue;
      }
      valid.push(f);
    }
    setFiles([...files, ...valid]);
    if (valid.length > 0) setError('');
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('يرجى اختيار ملف واحد على الأقل');
      return;
    }
    const customTitle = title.trim();
    setUploading(true);
    setError('');
    setProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileTitle = customTitle || file.name.replace(/\.[^.]+$/, '');

        const { data: recordData, error: recErr } = await supabase
          .from('archive_records')
          .insert({
            title: fileTitle,
            description: null,
            reference_number: null,
            category_id: categoryId || null,
            record_date: new Date().toISOString().slice(0, 10),
            status: 'active',
            tags: ['رفع دفعة'],
          })
          .select()
          .single();
        if (recErr) throw recErr;

        const recordId = recordData.id;
        const ext = file.name.split('.').pop() ?? '';
        const filePath = `${recordId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('archive-files').upload(filePath, file);
        if (upErr) throw upErr;

        const { error: dbErr } = await supabase.from('record_files').insert({
          record_id: recordId,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
        });
        if (dbErr) throw dbErr;

        setProgress(Math.round(((i + 1) / files.length) * 100));
      }

      setDone(true);
      onUploaded();
      setTimeout(() => {
        reset();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل رفع الملفات');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/90 px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-bold text-slate-800">رفع دفعة ملفات</h2>
          <button onClick={handleClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {done ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <Check size={32} className="text-emerald-600" />
              </div>
              <p className="mt-4 text-base font-bold text-slate-700">تم رفع {files.length} ملف بنجاح</p>
              <p className="mt-1 text-sm text-slate-400">تم إنشاء {files.length} سجل منفصل، كل ملف في سجل خاص به</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  عنوان السجلات <span className="text-slate-400 text-xs">(اختياري - سيستخدم اسم كل ملف إذا تركته فارغاً)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="عنوان السجل..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
                  disabled={uploading}
                />
              </div>

              {/* Category */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">التصنيف</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
                  disabled={uploading}
                >
                  <option value="">بدون تصنيف</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Drop zone + camera */}
              <div>
                <label
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-slate-500 transition hover:border-slate-400 hover:bg-slate-100"
                >
                  <Upload size={24} />
                  <span className="text-sm font-medium">اسحب الملفات هنا أو انقر للاختيار</span>
                  <span className="text-xs text-slate-400">يمكنك اختيار عدة ملفات مرة واحدة (حد أقصى 10 ميجابايت لكل ملف)</span>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
                <button
                  onClick={() => cameraRef.current?.click()}
                  disabled={uploading}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                >
                  <Camera size={20} />
                  التقاط من كاميرا الهاتف
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={uploading}
                  />
                </button>
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">{files.length} ملف جاهز للرفع</span>
                    <span className="text-xs text-slate-400">{formatFileSize(files.reduce((s, f) => s + f.size, 0))}</span>
                  </div>
                  <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
                    {files.map((f, idx) => (
                      <div key={idx} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
                        {isImage(f) ? (
                          <ImageIcon size={18} className="shrink-0 text-blue-500" />
                        ) : (
                          <FileIcon size={18} className="shrink-0 text-slate-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-700">{f.name}</p>
                          <p className="text-xs text-slate-400">{formatFileSize(f.size)}</p>
                        </div>
                        {!uploading && (
                          <button onClick={() => removeFile(idx)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress bar */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">جاري الرفع...</span>
                    <span className="font-bold text-slate-600">{progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-800 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                <button onClick={handleClose} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100" disabled={uploading}>
                  إلغاء
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading || files.length === 0}
                  className="flex items-center gap-2 rounded-xl bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-800/20 transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {uploading ? 'جاري الرفع...' : `رفع ${files.length > 0 ? `(${files.length})` : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
