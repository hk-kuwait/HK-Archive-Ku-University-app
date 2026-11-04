import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, FileText, ZoomIn, ZoomOut, ExternalLink, Download } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { pdfjsLib } from '@/lib/pdf';

interface PdfRendererProps {
  url: string;
  fileName: string;
  onReady: () => void;
}

interface PageEntry {
  page: PDFPageProxy;
  viewport: PageViewport;
  pageDiv: HTMLDivElement;
  textLayerDiv: HTMLDivElement;
}

const FETCH_TIMEOUT_MS = 15_000;

let lastLoaded: { url: string; bytes: ArrayBuffer } | null = null;

async function loadPdfBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  if (lastLoaded?.url === url) return lastLoaded.bytes;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  lastLoaded = { url, bytes };
  return bytes;
}

export default function PdfRenderer({ url, fileName, onReady }: PdfRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [fallbackIframe, setFallbackIframe] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const handleReady = useCallback(() => {
    setLoading(false);
    onReadyRef.current();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let blobUrlToRevoke: string | null = null;

    const showFallback = (data: ArrayBuffer | null) => {
      observer?.disconnect();
      if (data) {
        blobUrlToRevoke = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
        setBlobUrl(blobUrlToRevoke);
      } else {
        setBlobUrl(url);
      }
      setFallbackIframe(true);
      setLoading(false);
    };

    const renderPdf = async () => {
      setLoading(true);
      setFallbackIframe(false);

      const controller = new AbortController();
      const fetchTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let bytes: ArrayBuffer | null = null;

      try {
        bytes = await loadPdfBytes(url, controller.signal);
        clearTimeout(fetchTimer);
        if (cancelled) return;

        loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        const pages: PageEntry[] = [];
        const entryByElement = new Map<Element, PageEntry>();
        const rendered = new Set<PageEntry>();
        let readyNotified = false;

        const renderPage = async ({ page, viewport, pageDiv, textLayerDiv }: PageEntry) => {
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'block';
          pageDiv.prepend(canvas);

          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelled) return;

          const textContent = await page.getTextContent();
          if (cancelled) return;

          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
          });
          await textLayer.render();
        };

        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const entry = entryByElement.get(e.target);
            if (!entry || rendered.has(entry)) continue;
            rendered.add(entry);
            renderPage(entry)
              .then(() => {
                if (!cancelled && !readyNotified) {
                  readyNotified = true;
                  handleReady();
                }
              })
              .catch(() => {
                if (!cancelled && !readyNotified) showFallback(bytes);
              });
          }
        }, { root: container, rootMargin: '600px 0px' });
        observer = io;
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          if (cancelled) return;
          const viewport = page.getViewport({ scale });

          const pageDiv = document.createElement('div');
          pageDiv.className = 'relative mb-4 mx-auto shadow-lg bg-white';
          pageDiv.style.width = `${viewport.width}px`;
          pageDiv.style.height = `${viewport.height}px`;

          const textLayerDiv = document.createElement('div');
          textLayerDiv.className = 'pdf-text-layer';
          pageDiv.appendChild(textLayerDiv);

          container.appendChild(pageDiv);
          const entry: PageEntry = { page, viewport, pageDiv, textLayerDiv };
          pages.push(entry);
          entryByElement.set(pageDiv, entry);
          io.observe(pageDiv);
        }
        if (pages.length === 0) throw new Error('PDF has no pages');
      } catch {
        if (cancelled) return;
        showFallback(bytes);
      } finally {
        clearTimeout(fetchTimer);
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
      observer?.disconnect();
      void loadingTask?.destroy();
      if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, scale]);

  if (fallbackIframe && blobUrl) {
    return (
      <div className="flex h-full flex-col bg-slate-100">
        <div className="flex items-center justify-center gap-2 border-b border-slate-200 bg-white py-2">
          <span className="text-xs font-medium text-slate-400">العرض المبسط</span>
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            <ExternalLink size={12} />
            فتح في نافذة
          </a>
          <a
            href={url}
            download={fileName}
            className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            <Download size={12} />
            تحميل
          </a>
        </div>
        <iframe
          src={`${blobUrl}#view=FitH&toolbar=1`}
          title={fileName}
          className="h-full w-full border-0"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <div className="flex items-center justify-center gap-2 border-b border-slate-200 bg-white py-2">
        <button
          onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
        >
          <ZoomOut size={14} />
          تصغير
        </button>
        <span className="text-xs font-medium text-slate-400">{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale((s) => Math.min(3, s + 0.2))}
          className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
        >
          <ZoomIn size={14} />
          تكبير
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center overflow-hidden bg-slate-100 p-6">
            <div className="flex w-full max-w-2xl flex-1 flex-col gap-3 rounded-lg bg-white p-8 shadow-lg">
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              جاري تحميل الملف...
            </p>
          </div>
        )}
        <div ref={containerRef} className="flex flex-1 flex-col items-center overflow-auto p-4" />
      </div>
    </div>
  );
}
