import { useEffect, useState } from 'react';
import { Loader2, FileSpreadsheet, FileText } from 'lucide-react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

interface OfficeRendererProps {
  url: string;
  fileName: string;
  fileType: 'word' | 'excel';
  onFailed: () => void;
  onReady: () => void;
}

export default function OfficeRenderer({ url, fileName, fileType, onFailed, onReady }: OfficeRendererProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const fetchTimer = setTimeout(() => controller.abort(), 15_000);

    const render = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(fetchTimer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        if (fileType === 'word') {
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          if (cancelled) return;
          setHtmlContent(result.value || '<p>الملف فارغ</p>');
        } else {
          const wb = XLSX.read(buf, { type: 'array' });
          if (cancelled) return;
          const sheetData = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const html = XLSX.utils.sheet_to_html(ws, { id: name, editable: false });
            return { name, html };
          });
          setSheets(sheetData);
          setActiveSheet(0);
        }

        setLoading(false);
        onReady();
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
          onFailed();
        }
      }
    };

    render();

    return () => {
      cancelled = true;
      clearTimeout(fetchTimer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, fileType]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-slate-400">
        <Loader2 size={32} className="animate-spin" />
        <p className="mt-3 text-sm font-medium">جاري تحميل الملف...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-slate-400">
        {fileType === 'word' ? <FileText size={48} className="mb-3" /> : <FileSpreadsheet size={48} className="mb-3" />}
        <p className="text-sm font-medium">تعذر عرض الملف في المعاينة</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700">
          تحميل الملف
        </a>
      </div>
    );
  }

  if (fileType === 'word') {
    return (
      <div className="h-full overflow-auto bg-white p-6">
        <div
          className="prose prose-sm max-w-none text-slate-800 leading-relaxed [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-slate-50"
          dir="auto"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    );
  }

  const activeSheetData = sheets[activeSheet];

  return (
    <div className="flex h-full flex-col bg-white">
      {sheets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50 px-3 py-2">
          {sheets.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSheet(i)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                i === activeSheet ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        {activeSheetData && (
          <div
            className="[&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-slate-100 [&_th]:text-xs [&_th]:font-semibold"
            dangerouslySetInnerHTML={{ __html: activeSheetData.html }}
          />
        )}
      </div>
    </div>
  );
}
