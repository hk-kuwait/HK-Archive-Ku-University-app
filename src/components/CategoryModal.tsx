import { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { Category, CategoryInput } from '@/types';
import {
  AVAILABLE_ICONS, AVAILABLE_COLORS,
  getCategoryColor, getCategoryIcon,
} from '@/lib/constants';

interface CategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: CategoryInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  category: Category | null;
  categories: Category[];
}

export default function CategoryModal({
  open, onClose, onSave, onDelete, category, categories,
}: CategoryModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('slate');
  const [icon, setIcon] = useState('folder');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      if (category) {
        setName(category.name);
        setColor(category.color);
        setIcon(category.icon);
      } else {
        setName('');
        setColor('slate');
        setIcon('folder');
      }
      setError('');
      setConfirmDelete(false);
    }
  }, [open, category]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('يرجى إدخال اسم التصنيف');
      return;
    }
    const exists = categories.some(
      (c) => c.name === name.trim() && c.id !== category?.id
    );
    if (exists) {
      setError('اسم التصنيف موجود مسبقاً');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), color, icon });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !category) return;
    setSaving(true);
    try {
      await onDelete(category.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">
            {category ? 'تعديل التصنيف' : 'تصنيف جديد'}
          </h2>
          <button
            onClick={handleClose}
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
              اسم التصنيف <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم التصنيف..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">اللون</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_COLORS.map((c) => {
                const cc = getCategoryColor(c);
                const selected = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-9 w-9 rounded-lg bg-gradient-to-br ${cc.gradient} transition ${
                      selected ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">الأيقونة</label>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {AVAILABLE_ICONS.map((ic) => {
                const Icon = getCategoryIcon(ic);
                const selected = icon === ic;
                return (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`flex h-11 items-center justify-center rounded-xl border transition ${
                      selected
                        ? 'border-slate-800 bg-slate-800 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <Icon size={18} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="mb-2 text-xs font-semibold text-slate-500">معاينة</p>
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${getCategoryColor(color).gradient} text-white shadow-lg`}>
                {(() => {
                  const Icon = getCategoryIcon(icon);
                  return <Icon size={22} />;
                })()}
              </div>
              <span className="text-lg font-bold text-slate-800">{name || 'اسم التصنيف'}</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-5">
            <div>
              {category && onDelete && (
                !confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  >
                    <Trash2 size={16} /> حذف
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-rose-600">تأكيد الحذف؟</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={saving}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-500"
                    >
                      نعم
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                    >
                      لا
                    </button>
                  </div>
                )
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-800/20 transition hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
