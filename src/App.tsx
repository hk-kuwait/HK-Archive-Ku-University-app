import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, Search, Plus, FolderPlus, Folder, X, SlidersHorizontal,
  LayoutGrid, List, Inbox, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown,
  MessageCircle, UploadCloud,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ArchiveRecord, ArchiveRecordInput, Category, CategoryInput, RecordFile, SortField, SortOrder } from '@/types';
import { STATUS_CONFIG, getCategoryColor, getCategoryIcon } from '@/lib/constants';
import RecordCard from '@/components/RecordCard';
import RecordForm from '@/components/RecordForm';
import CategoryModal from '@/components/CategoryModal';
import FileViewer from '@/components/FileViewer';
import MergeModal from '@/components/MergeModal';
import BatchUploadModal from '@/components/BatchUploadModal';
import PageManager from '@/components/PageManager';

type ViewMode = 'grid' | 'list';

const SORT_LABELS: Record<SortField, string> = {
  record_date: 'التاريخ',
  title: 'العنوان',
  created_at: 'تاريخ الإضافة',
  reference_number: 'رقم المرجع',
};

export default function App() {
  const [records, setRecords] = useState<ArchiveRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filesMap, setFilesMap] = useState<Record<string, RecordFile[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('record_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ArchiveRecord | null>(null);
  const [editingRecordFiles, setEditingRecordFiles] = useState<RecordFile[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArchiveRecord | null>(null);
  const [viewerRecord, setViewerRecord] = useState<ArchiveRecord | null>(null);
  const [mergeRecord, setMergeRecord] = useState<ArchiveRecord | null>(null);
  const [pageManagerRecord, setPageManagerRecord] = useState<ArchiveRecord | null>(null);
  const [batchUploadOpen, setBatchUploadOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [recordsRes, categoriesRes, filesRes] = await Promise.all([
        supabase.from('archive_records').select('*'),
        supabase.from('categories').select('*').order('name'),
        supabase.from('record_files').select('*'),
      ]);
      if (recordsRes.error) throw recordsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (filesRes.error) throw filesRes.error;

      setRecords(recordsRes.data ?? []);
      setCategories(categoriesRes.data ?? []);

      const fm: Record<string, RecordFile[]> = {};
      for (const f of filesRes.data ?? []) {
        if (!fm[f.record_id]) fm[f.record_id] = [];
        fm[f.record_id].push(f);
      }
      setFilesMap(fm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRecords = useMemo(() => {
    const filtered = records.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && r.category_id !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const inTitle = r.title.toLowerCase().includes(q);
        const inDesc = r.description?.toLowerCase().includes(q) ?? false;
        const inRef = r.reference_number?.toLowerCase().includes(q) ?? false;
        const inTags = r.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
        if (!inTitle && !inDesc && !inRef && !inTags) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'title') {
        cmp = a.title.localeCompare(b.title, 'ar');
      } else if (sortField === 'reference_number') {
        cmp = (a.reference_number ?? '').localeCompare(b.reference_number ?? '', 'ar');
      } else if (sortField === 'record_date') {
        cmp = a.record_date.localeCompare(b.record_date);
      } else if (sortField === 'created_at') {
        cmp = a.created_at.localeCompare(b.created_at);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [records, statusFilter, categoryFilter, search, sortField, sortOrder]);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const handleSaveRecord = async (data: ArchiveRecordInput, newFiles: File[], deletedFileIds: string[]) => {
    let recordId = editingRecord?.id;

    if (editingRecord) {
      const { error: err } = await supabase
        .from('archive_records')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', editingRecord.id);
      if (err) throw err;
    } else {
      const { data: inserted, error: err } = await supabase
        .from('archive_records')
        .insert(data)
        .select()
        .single();
      if (err) throw err;
      recordId = inserted.id;
    }

    // Delete removed files
    for (const fileId of deletedFileIds) {
      const file = (filesMap[recordId!] ?? []).find((f) => f.id === fileId);
      if (file) {
        await supabase.storage.from('archive-files').remove([file.file_path, ...(file.thumbnail_path ? [file.thumbnail_path] : [])]);
      }
      await supabase.from('record_files').delete().eq('id', fileId);
    }

    // Upload new files
    for (const file of newFiles) {
      const ext = file.name.split('.').pop() ?? '';
      const filePath = `${recordId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('archive-files')
        .upload(filePath, file);
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from('record_files').insert({
        record_id: recordId,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
      });
      if (dbErr) throw dbErr;
    }

    await fetchData();
  };

  const handleDeleteRecord = async (id: string) => {
    const files = filesMap[id] ?? [];
    if (files.length > 0) {
      await supabase.storage.from('archive-files').remove(files.flatMap((f) => [f.file_path, ...(f.thumbnail_path ? [f.thumbnail_path] : [])]));
    }
    const { error: err } = await supabase.from('archive_records').delete().eq('id', id);
    if (err) throw err;
    await fetchData();
  };

  const handleSaveCategory = async (data: CategoryInput) => {
    if (editingCategory) {
      const { error: err } = await supabase.from('categories').update(data).eq('id', editingCategory.id);
      if (err) throw err;
    } else {
      const { error: err } = await supabase.from('categories').insert(data);
      if (err) throw err;
    }
    await fetchData();
  };

  const handleDeleteCategory = async (id: string) => {
    const { error: err } = await supabase.from('categories').delete().eq('id', id);
    if (err) throw err;
    await fetchData();
  };

  const openNewRecord = () => {
    setEditingRecord(null);
    setEditingRecordFiles([]);
    setFormOpen(true);
  };

  const openEditRecord = (r: ArchiveRecord) => {
    setEditingRecord(r);
    setEditingRecordFiles(filesMap[r.id] ?? []);
    setFormOpen(true);
  };

  const openNewCategory = () => {
    setEditingCategory(null);
    setCategoryModalOpen(true);
  };

  const openEditCategory = (c: Category) => {
    setEditingCategory(c);
    setCategoryModalOpen(true);
  };

  const activeFilters = statusFilter !== 'all' || categoryFilter !== 'all';
  const clearFilters = () => {
    setStatusFilter('all');
    setCategoryFilter('all');
  };

  const toggleSortOrder = () => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');

  const counts = {
    all: records.length,
    active: records.filter((r) => r.status === 'active').length,
    archived: records.filter((r) => r.status === 'archived').length,
    pending: records.filter((r) => r.status === 'pending').length,
    draft: records.filter((r) => r.status === 'draft').length,
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 font-sans text-slate-800" style={{ fontFamily: "'Segoe UI', 'Tahoma', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-lg">
                <Archive size={22} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">الأرشيف</h1>
                <p className="hidden text-xs text-slate-400 sm:block">نظام إدارة الأرشيف والمستندات</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={openNewCategory} className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200">
                <FolderPlus size={16} />
                <span className="hidden sm:inline">تصنيف</span>
              </button>
              <button onClick={() => setBatchUploadOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200">
                <UploadCloud size={16} />
                <span className="hidden sm:inline">رفع دفعة</span>
              </button>
              <button onClick={openNewRecord} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-800/20 transition hover:bg-slate-700">
                <Plus size={16} />
                <span>سجل جديد</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats bar */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-xl p-4 text-right transition ring-1 ${
              statusFilter === 'all' ? 'bg-slate-800 text-white ring-slate-800 shadow-lg' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'
            }`}
          >
            <p className="text-2xl font-bold">{counts.all}</p>
            <p className="text-xs font-medium opacity-80">إجمالي السجلات</p>
          </button>
          {(['active', 'pending', 'archived', 'draft'] as const).map((s) => {
            const cfg = STATUS_CONFIG[s];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(active ? 'all' : s)}
                className={`rounded-xl p-4 text-right transition ring-1 ${
                  active ? `${cfg.bg} ${cfg.text} ring-current shadow-sm` : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'
                }`}
              >
                <p className="text-2xl font-bold">{counts[s]}</p>
                <p className="text-xs font-medium opacity-80">{cfg.label}</p>
              </button>
            );
          })}
        </div>

        {/* Search + filters + sort */}
        <div className="mb-6 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في العنوان، الوصف، رقم المرجع، الوسوم..."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  showFilters || activeFilters ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                }`}
              >
                <SlidersHorizontal size={16} />
                <span className="hidden sm:inline">تصفية</span>
              </button>
              {/* Sort control */}
              <div className="flex items-center rounded-xl bg-white ring-1 ring-slate-200">
                <button
                  onClick={toggleSortOrder}
                  className="rounded-xl px-2.5 py-2.5 text-slate-500 transition hover:text-slate-700"
                  title={sortOrder === 'asc' ? 'تصاعدي' : 'تنازلي'}
                >
                  {sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                </button>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="cursor-pointer rounded-xl bg-transparent px-2 py-2.5 text-sm font-semibold text-slate-600 outline-none"
                >
                  {(Object.keys(SORT_LABELS) as SortField[]).map((f) => (
                    <option key={f} value={f}>{SORT_LABELS[f]}</option>
                  ))}
                </select>
                <ArrowUpDown size={14} className="ml-1 text-slate-300" />
              </div>
              <div className="flex rounded-xl bg-white ring-1 ring-slate-200">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`rounded-xl px-3 py-2.5 transition ${viewMode === 'grid' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`rounded-xl px-3 py-2.5 transition ${viewMode === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-500">التصنيف:</span>
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    categoryFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  الكل
                </button>
                {categories.map((cat) => {
                  const cc = getCategoryColor(cat.color);
                  const active = categoryFilter === cat.id;
                  const Icon = getCategoryIcon(cat.icon);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryFilter(active ? 'all' : cat.id)}
                      onDoubleClick={() => openEditCategory(cat)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        active ? `${cc.bg} ${cc.text} ring-1 ${cc.ring}` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <Icon size={14} />
                      {cat.name}
                    </button>
                  );
                })}
              </div>
              {activeFilters && (
                <button onClick={clearFilters} className="mr-auto inline-flex items-center gap-1 text-sm font-medium text-rose-500 transition hover:text-rose-600">
                  <X size={14} /> مسح التصفية
                </button>
              )}
            </div>
          )}
        </div>

        {/* Category strip */}
        {!showFilters && categories.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={() => { setShowFilters(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-500 ring-1 ring-slate-200 transition hover:ring-slate-300"
            >
              <Folder size={14} />
              {categories.length} تصنيفات
            </button>
            {categories.slice(0, 6).map((cat) => {
              const cc = getCategoryColor(cat.color);
              const Icon = getCategoryIcon(cat.icon);
              return (
                <button
                  key={cat.id}
                  onClick={() => { setCategoryFilter(cat.id); setShowFilters(true); }}
                  className={`inline-flex items-center gap-1.5 rounded-lg ${cc.bg} ${cc.text} px-3 py-1.5 text-sm font-medium ring-1 ${cc.border} transition hover:scale-105`}
                >
                  <Icon size={14} />
                  {cat.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
            <p className="mt-4 text-sm font-medium">جاري التحميل...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-50 p-8 text-center ring-1 ring-rose-200">
            <p className="font-semibold text-rose-700">{error}</p>
            <button onClick={fetchData} className="mt-4 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500">
              إعادة المحاولة
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-20 ring-1 ring-slate-200">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Inbox size={32} />
            </div>
            <p className="mt-4 text-base font-bold text-slate-600">
              {search || activeFilters ? 'لا توجد نتائج مطابقة' : 'لا توجد سجلات بعد'}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {search || activeFilters ? 'جرّب تعديل البحث أو التصفية' : 'ابدأ بإضافة أول سجل للأرشيف'}
            </p>
            {!search && !activeFilters && (
              <button onClick={openNewRecord} className="mt-5 flex items-center gap-1.5 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-800/20 transition hover:bg-slate-700">
                <Plus size={16} /> إضافة سجل
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredRecords.map((r) => (
              <RecordCard
                key={r.id}
                record={r}
                category={r.category_id ? categoryMap.get(r.category_id) ?? null : null}
                files={filesMap[r.id] ?? []}
                onEdit={() => openEditRecord(r)}
                onDelete={() => setDeleteTarget(r)}
                onViewFiles={() => setViewerRecord(r)}
                onMerge={() => setMergeRecord(r)}
                onManagePages={() => setPageManagerRecord(r)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRecords.map((r) => {
              const cat = r.category_id ? categoryMap.get(r.category_id) ?? null : null;
              const statusCfg = STATUS_CONFIG[r.status];
              const catColor = cat ? getCategoryColor(cat.color) : null;
              const CatIcon = cat ? getCategoryIcon(cat.icon) : null;
              const rFiles = filesMap[r.id] ?? [];
              const imgCount = rFiles.filter((f) => f.file_type?.startsWith('image/')).length;
              return (
                <div key={r.id} className="group flex items-center gap-4 rounded-xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-slate-300 hover:shadow-sm">
                  {catColor && CatIcon ? (
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${catColor.gradient} text-white`}>
                      <CatIcon size={18} />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                      <Archive size={18} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-slate-800">{r.title}</h3>
                      <span className={`shrink-0 rounded-md ${statusCfg.bg} ${statusCfg.text} px-2 py-0.5 text-xs font-semibold`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                      {cat && <span className="font-medium text-slate-500">{cat.name}</span>}
                      {r.reference_number && <span>رقم: {r.reference_number}</span>}
                      <span>{new Date(r.record_date).toLocaleDateString('ar-EG')}</span>
                      {rFiles.length > 0 && <span>{rFiles.length} ملف{imgCount > 0 ? ` (${imgCount} صورة)` : ''}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => openEditRecord(r)} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100">
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => {
                        let text = `*${r.title}*\n`;
                        if (r.reference_number) text += `\nرقم المرجع: ${r.reference_number}`;
                        if (r.description) text += `\n\n${r.description}`;
                        text += `\n\nالتاريخ: ${new Date(r.record_date).toLocaleDateString('ar-EG')}`;
                        text += `\nالحالة: ${statusCfg.label}`;
                        const fileLinks = rFiles.map((f) => `${f.file_name}: ${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/archive-files/${f.file_path}`).join('\n');
                        if (fileLinks) text += `\n\nالملفات:\n${fileLinks}`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                      }}
                      className="rounded-lg p-2 text-emerald-600 transition hover:bg-emerald-50"
                      title="إرسال عبر واتساب"
                    >
                      <MessageCircle size={16} />
                    </button>
                    <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-2 text-rose-500 transition hover:bg-rose-50">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <RecordForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSaveRecord}
        record={editingRecord}
        categories={categories}
        existingFiles={editingRecordFiles}
      />

      <CategoryModal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
        category={editingCategory}
        categories={categories}
      />

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">حذف السجل</h3>
            <p className="mt-2 text-sm text-slate-500">
              هل أنت متأكد من حذف "{deleteTarget.title}"؟ سيتم حذف جميع الملفات المرفقة. لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                إلغاء
              </button>
              <button
                onClick={async () => {
                  try {
                    await handleDeleteRecord(deleteTarget.id);
                    setDeleteTarget(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'فشل الحذف');
                  }
                }}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-500"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}

      <FileViewer
        open={!!viewerRecord}
        onClose={() => setViewerRecord(null)}
        files={viewerRecord ? (filesMap[viewerRecord.id] ?? []) : []}
        recordId={viewerRecord?.id ?? ''}
        recordTitle={viewerRecord?.title ?? ''}
      />

      <MergeModal
        open={!!mergeRecord}
        onClose={() => setMergeRecord(null)}
        files={mergeRecord ? (filesMap[mergeRecord.id] ?? []) : []}
        recordTitle={mergeRecord?.title ?? ''}
      />

      <PageManager
        open={!!pageManagerRecord}
        onClose={() => setPageManagerRecord(null)}
        sourceRecord={pageManagerRecord}
        sourceFiles={pageManagerRecord ? (filesMap[pageManagerRecord.id] ?? []) : []}
        allRecords={records}
        onDone={fetchData}
      />

      <BatchUploadModal
        open={batchUploadOpen}
        onClose={() => setBatchUploadOpen(false)}
        categories={categories}
        onUploaded={fetchData}
      />

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        نظام الأرشيف — إدارة المستندات والسجلات
      </footer>
    </div>
  );
}
