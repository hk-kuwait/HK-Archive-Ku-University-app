import { useEffect, useState, useRef } from 'react';
import { X, Tag, Plus, Trash2, Upload, File as FileIcon, Image as ImageIcon, Loader2, Camera } from 'lucide-react';
import type { ArchiveRecord, ArchiveRecordInput, Category, RecordFile, RecordStatus } from '@/types';
import { STATUS_CONFIG } from '@/lib/constants';
import { supabase } from '@/lib/supabase';

interface RecordFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: ArchiveRecordInput, files: File[], deletedFileIds: string[]) => Promise<void>;
  record: ArchiveRecord | null;
  categories: Category[];
  existingFiles: RecordFile[];
}

const STATUSES: RecordStatus[] = ['active', 'pending', 'archived', 'draft'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(file: File | RecordFile): boolean {
  const type = file instanceof File ? file.type : file.file_type ?? '';
  return type.startsWith('image/');
}

export default function RecordForm({ open, onClose, onSave, record, categories, existingFiles }: RecordFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [recordDate, setRecordDate] = useState('');
  const [status, setStatus] = useState<RecordStatus>('active');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [currentFiles, setCurrentFiles] = useState<RecordFile[]>([]);
  const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (record) {
      setTitle(record.title);
      setDescription(record.description ?? '');
      setReferenceNumber(record.reference_number ?? '');
      setCategoryId(record.category_id ?? '');
      setRecordDate(record.record_date);
      setStatus(record.status);
      setTags(record.tags ?? []);
    } else {
      setTitle('');
      setDescription('');
      setReferenceNumber('');
      setCategoryId('');
      setRecordDate(new Date().toISOString().slice(0, 10));
      setStatus('active');
      setTags([]);
    }
    setTagInput('');
    setError('');
    setNewFiles([]);
    setCurrentFiles(existingFiles);
    setDeletedFileIds([]);
  }, [record, open, existingFiles]);

  if (!open) return null;

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const valid = selected.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        setError(`الملف "${f.name}" يتجاوز الحد الأقصى (10 ميجابايت)`);
        return false;
      }
      return true;
    });
    setNewFiles([...newFiles, ...valid]);
    setError('');
  };

  const removeNewFile = (idx: number) => {
    setNewFiles(newFiles.filter((_, i) => i !== idx));
  };

  const removeExistingFile = (fileId: string) => {
    setCurrentFiles(currentFiles.filter((f) => f.id !== fileId));
    setDeletedFileIds([...deletedFileIds, fileId]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('يرجى إدخال العنوان');
      return;
    }
    if (!recordDate) {
      setError('يرجى اختيار التاريخ');
      return;
    }
    setSaving(true);
    setUploading(true);
    setError('');
    try {
      await onSave(
        {
          title: title.trim(),
          description: description.trim() || null,
          reference_number: referenceNumber.trim() || null,
          category_id: categoryId || null,
          record_date: recordDate,
          status,
          tags,
        },
        newFiles,
        deletedFileIds,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/90 px-6 py-4 backdrop-blur">
          <h2 className="text-lg font-bold text-slate-800">
            {record ? 'تعديل السجل' : 'سجل جديد'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          {error && (
            <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              العنوان <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان المستند..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">رقم المرجع</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="رقم المستند..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">التصنيف</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              >
                <option value="">بدون تصنيف</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                التاريخ <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">الحالة</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RecordStatus)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">الوصف</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف تفصيلي..."
              rows={3}
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">الوسوم</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                  }}
                  placeholder="أضف وسماً..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <button type="button" onClick={addTag} className="rounded-xl bg-slate-100 px-4 py-2.5 text-slate-600 transition hover:bg-slate-200">
                <Plus size={18} />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600">
                    {tag}
                    <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))} className="text-slate-400 transition hover:text-rose-500">
                      <Trash2 size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* File uploads */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">الملفات والصور</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-slate-500 transition hover:border-slate-400 hover:bg-slate-100">
              <Upload size={20} />
              <span className="text-sm font-medium">انقر لاختيار الملفات (حد أقصى 10 ميجابايت لكل ملف)</span>
              <input type="file" multiple onChange={handleFileSelect} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
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
              />
            </button>

            {/* Existing files */}
            {currentFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {currentFiles.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                    {f.file_type?.startsWith('image/') ? (
                      <img
                        src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/archive-files/${f.file_path}`}
                        alt={f.file_name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-slate-500">
                        <FileIcon size={18} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">{f.file_name}</p>
                      {f.file_size && <p className="text-xs text-slate-400">{formatFileSize(f.file_size)}</p>}
                    </div>
                    <button type="button" onClick={() => removeExistingFile(f.id)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* New files */}
            {newFiles.length > 0 && (
              <div className="mt-2 space-y-2">
                {newFiles.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2 ring-1 ring-blue-100">
                    {isImage(f) ? (
                      <ImageIcon size={18} className="text-blue-500" />
                    ) : (
                      <FileIcon size={18} className="text-blue-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">{f.name}</p>
                      <p className="text-xs text-slate-400">{formatFileSize(f.size)}</p>
                    </div>
                    <button type="button" onClick={() => removeNewFile(idx)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-800/20 transition hover:bg-slate-700 disabled:opacity-50"
            >
              {uploading && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
