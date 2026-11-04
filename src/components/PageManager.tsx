import { useState, useEffect, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import {
  X, File as FileIcon, Image as ImageIcon, FileText, ArrowLeft, ArrowRight,
  Download, Loader2, Check, Folder, Plus, FilePlus2, Trash2,
} from 'lucide-react';
import type { ArchiveRecord, RecordFile } from '@/types';
import { supabase } from '@/lib/supabase';
import { appendPagesToPdf, downloadBytes, removePagesFromPdf, replaceFileContent } from '@/lib/pdfPages';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PageManagerProps {
  open: boolean;
  onClose: () => void;
  sourceRecord: ArchiveRecord | null;
  sourceFiles: RecordFile[];
  allRecords: ArchiveRecord[];
  onDone: () => void;
}

type SelectableItem = {
  fileId: string;
  fileName: string;
  fileType: string | null;
  filePath: string;
  isPdf: boolean;
  pages: number[];
  selectedPages: Set<number>;
  selected: boolean;
};

function getFileUrl(path: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/archive-files/${path}`;
}

async function getPdfPageCount(url: string): Promise<number> {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    return pdf.numPages;
  } catch {
    return 1;
  }
}

export default function PageManager({ open, onClose, sourceRecord, sourceFiles, allRecords, onDone }: PageManagerProps) {
  const [items, setItems] = useState<SelectableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [targetRecordId, setTargetRecordId] = useState<string>('');
  const [showNewRecordForm, setShowNewRecordForm] = useState(false);
  const [newRecordTitle, setNewRecordTitle] = useState('');
  const [targetFiles, setTargetFiles] = useState<RecordFile[]>([]);
  const [mergeIntoFileId, setMergeIntoFileId] = useState('');

  useEffect(() => {
    if (!open || !sourceRecord) return;
    setTargetRecordId('');
    setShowNewRecordForm(false);
    setNewRecordTitle('');
    setError('');
    setSuccess('');

    const init = async () => {
      setItems([]);
      setLoading(true);
      const baseItems: SelectableItem[] = sourceFiles.map((f) => ({
        fileId: f.id,
        fileName: f.file_name,
        fileType: f.file_type,
        filePath: f.file_path,
        isPdf: f.file_type === 'application/pdf' || f.file_name.toLowerCase().endsWith('.pdf'),
        pages: [],
        selectedPages: new Set<number>(),
        selected: false,
      }));
      setItems(baseItems);

      const pdfItems = baseItems.filter((it) => it.isPdf);
      const pageCounts = await Promise.all(
        pdfItems.map(async (it) => ({ fileId: it.fileId, count: await getPdfPageCount(getFileUrl(it.filePath)) }))
      );
      setItems((prev) =>
        prev.map((it) => {
          const pc = pageCounts.find((p) => p.fileId === it.fileId);
          if (pc && pc.count > 1) {
            return { ...it, pages: Array.from({ length: pc.count }, (_, i) => i + 1) };
          }
          return it;
        })
      );
      setLoading(false);
    };
    init();
  }, [open, sourceRecord?.id, sourceFiles]);

  useEffect(() => {
    setMergeIntoFileId('');
    if (!targetRecordId) {
      setTargetFiles([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('record_files')
      .select('*')
      .eq('record_id', targetRecordId)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError('تعذر تحميل ملفات السجل الهدف');
          setTargetFiles([]);
          return;
        }
        setTargetFiles(((data ?? []) as RecordFile[]).filter((f) => f.file_type === 'application/pdf' || f.file_name.toLowerCase().endsWith('.pdf')));
      });
    return () => {
      cancelled = true;
    };
  }, [targetRecordId]);

  const toggleItem = (fileId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.fileId === fileId
          ? { ...it, selected: !it.selected, selectedPages: it.isPdf && !it.selected ? new Set(it.pages.length > 0 ? it.pages : [1]) : new Set() }
          : it
      )
    );
  };

  const togglePage = (fileId: string, page: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.fileId !== fileId) return it;
        const newSet = new Set(it.selectedPages);
        if (newSet.has(page)) newSet.delete(page);
        else newSet.add(page);
        return { ...it, selectedPages: newSet, selected: newSet.size > 0 };
      })
    );
  };

  const selectedItems = useMemo(() => items.filter((it) => it.selected && it.selectedPages.size > 0), [items]);

  const otherRecords = useMemo(() => allRecords.filter((r) => r.id !== sourceRecord?.id), [allRecords, sourceRecord?.id]);

  const handleTransfer = async () => {
    if (selectedItems.length === 0) return;
    if (!targetRecordId && !showNewRecordForm) {
      setError('اختر السجل الهدف أو أنشئ سجلاً جديداً');
      return;
    }
    if (showNewRecordForm && !newRecordTitle.trim()) {
      setError('اكتب عنوان السجل الجديد');
      return;
    }
    setProcessing(true);
    setError('');
    setSuccess('');
    try {
      let destRecordId = targetRecordId;
      if (showNewRecordForm) {
        const { data: newRec, error: err } = await supabase
          .from('archive_records')
          .insert({
            title: newRecordTitle.trim(),
            record_date: new Date().toISOString().slice(0, 10),
            status: 'active',
            tags: [],
            category_id: sourceRecord?.category_id ?? null,
          })
          .select()
          .single();
        if (err) throw err;
        destRecordId = newRec.id;
      }
      if (!destRecordId) throw new Error('لم يتم تحديد السجل الهدف');

      let mergeDest = mergeIntoFileId ? targetFiles.find((f) => f.id === mergeIntoFileId) ?? null : null;
      for (const it of selectedItems) {
        const url = getFileUrl(it.filePath);
        const res = await fetch(url);
        const buf = await res.arrayBuffer();

        if (it.isPdf && mergeDest) {
          const destBytes = await downloadBytes(mergeDest.file_path);
          const merged = await appendPagesToPdf(destBytes, new Uint8Array(buf), Array.from(it.selectedPages));
          mergeDest = await replaceFileContent(mergeDest, merged);
        } else if (it.isPdf && it.selectedPages.size > 0 && it.selectedPages.size < (it.pages.length || 1)) {
          // Extract specific pages into a new PDF
          const srcPdf = await PDFDocument.load(buf);
          const destPdf = await PDFDocument.create();
          const pageIndices = Array.from(it.selectedPages).sort((a, b) => a - b).map((p) => p - 1);
          const copied = await destPdf.copyPages(srcPdf, pageIndices as number[]);
          copied.forEach((p: import('pdf-lib').PDFPage) => destPdf.addPage(p));
          const pdfBytes = await destPdf.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const newFileName = it.fileName.replace(/\.pdf$/i, '') + `_extracted.pdf`;
          const newPath = `${destRecordId}/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
          const { error: upErr } = await supabase.storage.from('archive-files').upload(newPath, blob);
          if (upErr) throw upErr;
          const { error: dbErr } = await supabase.from('record_files').insert({
            record_id: destRecordId,
            file_name: newFileName,
            file_path: newPath,
            file_type: 'application/pdf',
            file_size: blob.size,
          });
          if (dbErr) throw dbErr;
        } else {
          // Whole file — copy to destination
          const blob = new Blob([buf], { type: it.fileType || 'application/octet-stream' });
          const ext = it.fileName.split('.').pop() ?? '';
          const newPath = `${destRecordId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage.from('archive-files').upload(newPath, blob);
          if (upErr) throw upErr;
          const { error: dbErr } = await supabase.from('record_files').insert({
            record_id: destRecordId,
            file_name: it.fileName,
            file_path: newPath,
            file_type: it.fileType,
            file_size: blob.size,
          });
          if (dbErr) throw dbErr;
        }
      }

      setSuccess(`تم نقل ${selectedItems.length} عنصر إلى السجل الوجهة بنجاح`);
      onDone();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت عملية النقل');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeletePages = async () => {
    const pdfItems = selectedItems.filter((it) => it.isPdf);
    if (pdfItems.length === 0) return;
    if (!window.confirm('سيتم حذف الصفحات المحددة من الملف الأصلي نهائياً. هل تريد المتابعة؟')) return;
    setProcessing(true);
    setError('');
    setSuccess('');
    try {
      for (const it of pdfItems) {
        const file = sourceFiles.find((f) => f.id === it.fileId);
        if (!file) throw new Error('تعذر العثور على الملف');
        const bytes = await downloadBytes(file.file_path);
        const kept = await removePagesFromPdf(bytes, Array.from(it.selectedPages));
        await replaceFileContent(file, kept);
      }
      setSuccess(`تم حذف الصفحات المحددة من ${pdfItems.length} ملف`);
      onDone();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل حذف الصفحات');
    } finally {
      setProcessing(false);
    }
  };

  if (!open || !sourceRecord) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FilePlus2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">فصل ودمج الصفحات</h2>
              <p className="text-xs text-slate-400">المصدر: {sourceRecord.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
              {success}
            </div>
          )}

          <p className="mb-4 text-sm text-slate-500">
            حدد الصفحات أو الملفات التي تريد نقلها من هذا السجل إلى سجل آخر. يمكنك اختيار صفحات محددة من ملفات PDF أو نقل ملفات كاملة.
          </p>

          {/* File list */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={24} className="animate-spin" />
              <span className="mr-2 text-sm font-medium">جاري تحميل الملفات...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <FileIcon size={32} className="mb-2" />
              <p className="text-sm">لا توجد ملفات في هذا السجل</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((it) => (
                <div
                  key={it.fileId}
                  className={`rounded-xl p-4 ring-1 transition ${
                    it.selected ? 'bg-blue-50 ring-blue-200' : 'bg-slate-50 ring-slate-100 hover:ring-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleItem(it.fileId)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                        it.selected ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                      }`}
                    >
                      {it.selected && <Check size={12} className="text-white" />}
                    </button>
                    {it.isPdf ? <FileText size={18} className="shrink-0 text-rose-400" /> : it.fileType?.startsWith('image/') ? <ImageIcon size={18} className="shrink-0 text-blue-400" /> : <FileIcon size={18} className="shrink-0 text-slate-400" />}
                    <span className="flex-1 truncate text-sm font-semibold text-slate-700">{it.fileName}</span>
                    {it.pages.length > 1 && (
                      <span className="shrink-0 rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-500">{it.pages.length} صفحة</span>
                    )}
                  </div>

                  {/* Page selector for multi-page PDFs */}
                  {it.isPdf && it.pages.length > 1 && it.selected && (
                    <div className="mt-3 mr-8 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                      <span className="w-full text-xs font-medium text-slate-400 mb-1">اختر الصفحات:</span>
                      {it.pages.map((pg) => (
                        <button
                          key={pg}
                          onClick={() => togglePage(it.fileId, pg)}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition ${
                            it.selectedPages.has(pg)
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:ring-slate-300'
                          }`}
                        >
                          {pg}
                        </button>
                      ))}
                      <button
                        onClick={() => setItems((prev) => prev.map((x) => x.fileId === it.fileId ? { ...x, selectedPages: new Set(x.pages), selected: true } : x))}
                        className="mr-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                      >
                        الكل
                      </button>
                      <button
                        onClick={() => setItems((prev) => prev.map((x) => x.fileId === it.fileId ? { ...x, selectedPages: new Set(), selected: false } : x))}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                      >
                        لا شيء
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Target selection */}
          {!loading && items.length > 0 && (
            <div className="mt-6 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
                <Folder size={16} className="text-slate-400" />
                نقل إلى:
              </h3>

              {showNewRecordForm ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newRecordTitle}
                    onChange={(e) => setNewRecordTitle(e.target.value)}
                    placeholder="عنوان السجل الجديد..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    dir="auto"
                  />
                  <button
                    onClick={() => { setShowNewRecordForm(false); setNewRecordTitle(''); }}
                    className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
                  >
                    العودة لاختيار سجل موجود
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {otherRecords.length === 0 ? (
                    <p className="text-sm text-slate-400">لا توجد سجلات أخرى. أنشئ سجلاً جديداً.</p>
                  ) : (
                    <div className="max-h-48 space-y-1.5 overflow-y-auto">
                      {otherRecords.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => setTargetRecordId(r.id)}
                          className={`flex w-full items-center gap-3 rounded-lg p-2.5 text-right transition ${
                            targetRecordId === r.id ? 'bg-blue-100 ring-1 ring-blue-300' : 'bg-white ring-1 ring-slate-100 hover:ring-slate-200'
                          }`}
                        >
                          <Folder size={16} className="shrink-0 text-slate-400" />
                          <span className="flex-1 truncate text-sm font-medium text-slate-700">{r.title}</span>
                          {targetRecordId === r.id && <Check size={16} className="text-blue-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { setShowNewRecordForm(true); setTargetRecordId(''); }}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                  >
                    <Plus size={14} />
                    إنشاء سجل جديد
                  </button>
                </div>
              )}
              {targetRecordId && targetFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <label className="block text-xs font-semibold text-slate-500">إضافة صفحات PDF المحددة إلى:</label>
                  <select
                    value={mergeIntoFileId}
                    onChange={(e) => setMergeIntoFileId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="">ملف جديد</option>
                    {targetFiles.map((f) => (
                      <option key={f.id} value={f.id}>{f.file_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-4">
          <div className="text-sm text-slate-500">
            {selectedItems.length > 0 ? `${selectedItems.length} عنصر محدد` : 'لم يتم تحديد عناصر'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDeletePages}
              disabled={processing || !selectedItems.some((it) => it.isPdf)}
              className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={16} />
              حذف الصفحات
            </button>
            <button onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
              إلغاء
            </button>
            <button
              onClick={handleTransfer}
              disabled={processing || selectedItems.length === 0 || (!targetRecordId && !showNewRecordForm)}
              className="flex items-center gap-2 rounded-xl bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeft size={16} />}
              {processing ? 'جاري النقل...' : 'نقل إلى السجل'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
