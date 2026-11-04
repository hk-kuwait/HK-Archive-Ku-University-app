import { useState } from 'react';
import {
  Pencil, Trash2, Calendar, Hash, Tag, File as FileIcon, Image as ImageIcon,
  Paperclip, MessageCircle, Download, X, Eye, GitMerge, Link2, Check, Printer,
  Archive, Loader2, FilePlus2,
} from 'lucide-react';
import JSZip from 'jszip';
import type { ArchiveRecord, Category, RecordFile } from '@/types';
import { STATUS_CONFIG, getCategoryColor, getCategoryIcon } from '@/lib/constants';
import { getFileUrl } from '@/lib/storage';
import FileThumbnail from '@/components/FileThumbnail';

interface RecordCardProps {
  record: ArchiveRecord;
  category: Category | null;
  files: RecordFile[];
  onEdit: () => void;
  onDelete: () => void;
  onViewFiles: () => void;
  onMerge: () => void;
  onManagePages: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RecordCard({ record, category, files, onEdit, onDelete, onViewFiles, onMerge, onManagePages }: RecordCardProps) {
  const statusCfg = STATUS_CONFIG[record.status];
  const catColor = category ? getCategoryColor(category.color) : null;
  const CatIcon = category ? getCategoryIcon(category.icon) : null;
  const [showFiles, setShowFiles] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [urlsCopied, setUrlsCopied] = useState(false);
  const [zipping, setZipping] = useState(false);

  const imageFiles = files.filter((f) => f.file_type?.startsWith('image/'));

  const shareOnWhatsApp = () => {
    let text = `*${record.title}*\n`;
    if (record.reference_number) text += `\nرقم المرجع: ${record.reference_number}`;
    if (record.description) text += `\n\n${record.description}`;
    text += `\n\nالتاريخ: ${new Date(record.record_date).toLocaleDateString('ar-EG')}`;
    text += `\nالحالة: ${statusCfg.label}`;
    if (category) text += `\nالتصنيف: ${category.name}`;
    if (record.tags && record.tags.length > 0) text += `\nالوسوم: ${record.tags.join('، ')}`;
    const fileLinks = files.map((f) => `${f.file_name}: ${getFileUrl(f.file_path)}`).join('\n');
    if (fileLinks) text += `\n\nالملفات:\n${fileLinks}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const copyAllUrls = async () => {
    const urls = files.map((f) => `${f.file_name}: ${getFileUrl(f.file_path)}`).join('\n');
    await navigator.clipboard.writeText(urls);
    setUrlsCopied(true);
    setTimeout(() => setUrlsCopied(false), 2000);
  };

  const downloadAllAsZip = async () => {
    if (files.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const folderName = record.title.replace(/[\\/:*?"<>|]/g, '_') || 'ملفات';
      const folder = zip.folder(folderName)!;
      await Promise.all(
        files.map(async (f) => {
          const res = await fetch(getFileUrl(f.file_path));
          const blob = await res.blob();
          folder.file(f.file_name, blob);
        })
      );
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP download failed:', err);
    } finally {
      setZipping(false);
    }
  };

  const printFiles = () => {
    if (imageFiles.length > 0) {
      const w = window.open('', '_blank');
      if (!w) return;
      const images = imageFiles.map((f) => `<img src="${getFileUrl(f.file_path)}"/>`).join('');
      w.document.write(`<html dir="rtl"><head><title>طباعة</title><style>@page{margin:1cm}img{max-width:100%;display:block;margin:0 auto 1cm}</style></head><body>${images}<script>window.onload=function(){window.print()}</script></body></html>`);
      w.document.close();
    } else {
      files.forEach((f) => window.open(getFileUrl(f.file_path), '_blank'));
    }
  };

  return (
    <>
      <div className="group relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 transition hover:ring-slate-300 hover:shadow-lg hover:shadow-slate-200/50">
        {catColor && <div className={`h-1.5 w-full bg-gradient-to-l ${catColor.gradient}`} />}

        <div className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            {category && catColor && CatIcon ? (
              <span className={`inline-flex items-center gap-1.5 rounded-lg ${catColor.bg} ${catColor.text} px-2.5 py-1 text-xs font-semibold`}>
                <CatIcon size={13} />
                {category.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                غير مصنف
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-lg ${statusCfg.bg} ${statusCfg.text} px-2.5 py-1 text-xs font-semibold`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </span>
          </div>

          <h3 className="mb-2 line-clamp-2 text-base font-bold text-slate-800">{record.title}</h3>

          {record.description && (
            <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-slate-500">{record.description}</p>
          )}

          {/* File thumbnails */}
          {files.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {files.slice(0, 3).map((f) => {
                const isImg = f.file_type?.startsWith('image/');
                return (
                  <button
                    key={f.id}
                    onClick={() => isImg ? setLightbox(getFileUrl(f.file_path)) : onViewFiles()}
                    className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-slate-100 transition hover:ring-slate-300"
                  >
                    <FileThumbnail file={f} />
                  </button>
                );
              })}
              {files.length > 3 && (
                <button
                  onClick={onViewFiles}
                  className="flex aspect-square items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500 transition hover:bg-slate-200"
                >
                  +{files.length - 3}
                </button>
              )}
            </div>
          )}

          <div className="space-y-1.5 text-xs text-slate-400">
            {record.reference_number && (
              <div className="flex items-center gap-1.5">
                <Hash size={13} className="text-slate-300" />
                <span className="font-medium text-slate-500">{record.reference_number}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Calendar size={13} className="text-slate-300" />
              <span className="font-medium text-slate-500">
                {new Date(record.record_date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
          </div>

          {record.tags && record.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {record.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-100">
                  <Tag size={10} />{tag}
                </span>
              ))}
            </div>
          )}

          {/* File actions bar */}
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={onViewFiles}
                className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-100 transition hover:bg-slate-100"
              >
                <Eye size={13} />
                معاينة الملفات
              </button>
              <button
                onClick={() => setShowFiles(!showFiles)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-700"
              >
                <Paperclip size={13} />
                {files.length} ملف
                {imageFiles.length > 0 && ` (${imageFiles.length} صورة)`}
              </button>
              {files.length > 1 && (
                <button
                  onClick={copyAllUrls}
                  className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-100 transition hover:bg-slate-100"
                  title="نسخ روابط جميع الملفات"
                >
                  {urlsCopied ? <Check size={12} className="text-emerald-500" /> : <Link2 size={12} />}
                </button>
              )}
              <button
                onClick={printFiles}
                className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-100 transition hover:bg-slate-100"
                title="طباعة ملفات السجل"
              >
                <Printer size={12} />
                <span>طباعة</span>
              </button>
              {files.length > 1 && (
                <button
                  onClick={downloadAllAsZip}
                  disabled={zipping}
                  className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                  title="تحميل جميع الملفات كملف مضغوط"
                >
                  {zipping ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                  <span>تحميل الكل</span>
                </button>
              )}
            </div>
          )}

          {/* Expandable file list */}
          {showFiles && files.length > 0 && (
            <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
              {files.map((f) => {
                const url = getFileUrl(f.file_path);
                return (
                  <div key={f.id} className="flex items-center gap-2">
                    {f.file_type?.startsWith('image/') ? (
                      <ImageIcon size={15} className="shrink-0 text-slate-400" />
                    ) : (
                      <FileIcon size={15} className="shrink-0 text-slate-400" />
                    )}
                    <button
                      onClick={onViewFiles}
                      className="flex min-w-0 flex-1 items-center gap-1 text-xs font-medium text-slate-600 transition hover:text-slate-800"
                    >
                      <span className="truncate">{f.file_name}</span>
                      {f.file_size && <span className="shrink-0 text-slate-400">{formatFileSize(f.file_size)}</span>}
                    </button>
                    <a href={url} download={f.file_name} className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600" title="تحميل">
                      <Download size={13} />
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex gap-2 border-t border-slate-50 pt-3">
            <button onClick={onEdit} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-50 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
              <Pencil size={14} /> تعديل
            </button>
            {files.length > 0 && (
              <button onClick={onManagePages} className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100" title="فصل ودمج الصفحات">
                <FilePlus2 size={14} />
              </button>
            )}
            {files.length > 1 && (
              <button onClick={onMerge} className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100" title="دمج الملفات">
                <GitMerge size={14} />
              </button>
            )}
            <button onClick={shareOnWhatsApp} className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-100" title="إرسال عبر واتساب">
              <MessageCircle size={14} />
            </button>
            <button onClick={onDelete} className="flex items-center justify-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />
          <div className="relative max-h-[90vh] max-w-3xl">
            <button className="absolute -top-10 right-0 rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20">
              <X size={20} />
            </button>
            <img src={lightbox} alt="" className="max-h-[90vh] rounded-xl object-contain" />
          </div>
        </div>
      )}
    </>
  );
}
