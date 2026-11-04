import { useEffect, useState, useCallback, useRef, useLayoutEffect, lazy, Suspense } from 'react';
import {
  X, Copy, Download, Printer, Highlighter, Trash2, File as FileIcon,
  Image as ImageIcon, FileText, FileSpreadsheet, Check, Link2, Pencil, Save, Loader2, Archive,
  MessageCircle, ClipboardType, Sparkles, Camera, Eraser, Square, Undo2,
  Sun, Contrast, Zap, Paintbrush,
} from 'lucide-react';
import JSZip from 'jszip';
import type { RecordFile, FileHighlight, FileHighlightInput } from '@/types';
import { supabase } from '@/lib/supabase';

const PdfRenderer = lazy(() => import('@/components/PdfRenderer'));
const OfficeRenderer = lazy(() => import('@/components/OfficeRenderer'));

interface FileViewerProps {
  open: boolean;
  onClose: () => void;
  files: RecordFile[];
  recordId: string;
  recordTitle: string;
}

const HIGHLIGHT_COLORS = [
  { id: 'yellow', bg: 'bg-yellow-200', text: 'text-yellow-800', dot: 'bg-yellow-400' },
  { id: 'green', bg: 'bg-green-200', text: 'text-green-800', dot: 'bg-green-400' },
  { id: 'blue', bg: 'bg-blue-200', text: 'text-blue-800', dot: 'bg-blue-400' },
  { id: 'pink', bg: 'bg-pink-200', text: 'text-pink-800', dot: 'bg-pink-400' },
  { id: 'orange', bg: 'bg-orange-200', text: 'text-orange-800', dot: 'bg-orange-400' },
];

const RECT_COLORS: Record<string, string> = {
  yellow: 'rgba(253, 224, 71, 0.35)',
  green: 'rgba(134, 239, 172, 0.35)',
  blue: 'rgba(147, 197, 253, 0.35)',
  pink: 'rgba(249, 168, 212, 0.35)',
  orange: 'rgba(253, 186, 116, 0.35)',
};

const RECT_BORDERS: Record<string, string> = {
  yellow: 'rgba(234, 179, 8, 0.8)',
  green: 'rgba(34, 197, 94, 0.8)',
  blue: 'rgba(59, 130, 246, 0.8)',
  pink: 'rgba(236, 72, 153, 0.8)',
  orange: 'rgba(249, 115, 22, 0.8)',
};

function getColorClasses(color: string) {
  return HIGHLIGHT_COLORS.find((c) => c.id === color) ?? HIGHLIGHT_COLORS[0];
}

function getFileUrl(path: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/archive-files/${path}`;
}

function isImageFile(file: RecordFile | undefined): boolean {
  if (!file) return false;
  return file.file_type?.startsWith('image/') ?? false;
}

function isPdfFile(file: RecordFile | undefined): boolean {
  if (!file) return false;
  return file.file_type === 'application/pdf' || file.file_name.toLowerCase().endsWith('.pdf');
}

function isTextFile(file: RecordFile | undefined): boolean {
  if (!file) return false;
  const t = file.file_type ?? '';
  return t.startsWith('text/') || /\.(txt|md|csv|json|xml|html?|css|js|ts)$/i.test(file.file_name);
}

function isWordFile(file: RecordFile | undefined): boolean {
  if (!file) return false;
  const t = file.file_type ?? '';
  return t.includes('word') || /\.docx$/i.test(file.file_name);
}

function isExcelFile(file: RecordFile | undefined): boolean {
  if (!file) return false;
  const t = file.file_type ?? '';
  return t.includes('spreadsheet') || t.includes('excel') || /\.(xlsx|xls)$/i.test(file.file_name);
}

function getVisiblePdfPageInfo(): { page: number; text: string; total: number } {
  // PdfRenderer renders pages as direct div children inside a scroll container
  // The scroll container is the div with classes "flex flex-1 flex-col items-center overflow-auto p-4"
  const container = document.querySelector('.flex.flex-1.flex-col.items-center.overflow-auto');
  if (!container) return { page: 1, text: '', total: 0 };
  // Page divs are direct children that contain a canvas + a .pdf-text-layer
  const pages = container.querySelectorAll(':scope > div');
  if (pages.length === 0) return { page: 1, text: '', total: 0 };
  const containerTop = container.scrollTop;
  const containerCenter = containerTop + container.clientHeight / 2;
  let bestPage = 1;
  let bestDist = Infinity;
  let bestEl: Element | null = null;
  pages.forEach((page, idx) => {
    const el = page as HTMLElement;
    const mid = el.offsetTop + el.offsetHeight / 2;
    const dist = Math.abs(mid - containerCenter);
    if (dist < bestDist) {
      bestDist = dist;
      bestPage = idx + 1;
      bestEl = el;
    }
  });
  let pageText = '';
  if (bestEl) {
    const textLayer = (bestEl as Element).querySelector('.pdf-text-layer');
    if (textLayer) {
      pageText = (textLayer.textContent || '').replace(/\s+/g, ' ').trim();
    }
  }
  return { page: bestPage, text: pageText, total: pages.length };
}

function SkeletonLoader() {
  return (
    <div className="flex h-full flex-col items-center gap-3 bg-slate-100 p-6">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
      <div className="w-full max-w-md space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="mt-4 h-64 w-full max-w-md animate-pulse rounded-lg bg-slate-200" />
    </div>
  );
}

type ImageMode = 'none' | 'enhance' | 'denoise' | 'sharpen' | 'brightness' | 'contrast';

type EraserStroke = { x: number; y: number; r: number }[];

type EditAction =
  | { type: 'highlight'; data: FileHighlight }
  | { type: 'imageMode'; prevMode: ImageMode; prevDataUrl: string | null }
  | { type: 'eraser'; prevDataUrl: string | null };

function processImageCanvas(img: HTMLImageElement, canvas: HTMLCanvasElement, mode: ImageMode) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  if (mode === 'enhance') {
    const contrast = 1.45;
    const intercept = 128 * (1 - contrast);
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) * contrast + intercept;
    }
    const denoised = new Uint8ClampedArray(gray.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) { denoised[idx] = gray[idx]; continue; }
        const neighbors = [
          gray[(y - 1) * w + (x - 1)], gray[(y - 1) * w + x], gray[(y - 1) * w + (x + 1)],
          gray[y * w + (x - 1)], gray[idx], gray[y * w + (x + 1)],
          gray[(y + 1) * w + (x - 1)], gray[(y + 1) * w + x], gray[(y + 1) * w + (x + 1)],
        ].sort((a, b) => a - b);
        denoised[idx] = neighbors[4];
      }
    }
    const windowR = 7;
    const result = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        let sum = 0, count = 0;
        for (let dy = -windowR; dy <= windowR; dy++) {
          for (let dx = -windowR; dx <= windowR; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) { sum += denoised[ny * w + nx]; count++; }
          }
        }
        const localMean = sum / count;
        const threshold = localMean - 10;
        const val = denoised[idx] > threshold ? 255 : 0;
        const o = idx * 4;
        result.data[o] = val; result.data[o + 1] = val; result.data[o + 2] = val; result.data[o + 3] = 255;
      }
    }
    ctx.putImageData(result, 0, 0);
    return;
  }

  if (mode === 'denoise') {
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    const denoised = new Uint8ClampedArray(gray.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) { denoised[idx] = gray[idx]; continue; }
        const neighbors = [
          gray[(y - 1) * w + (x - 1)], gray[(y - 1) * w + x], gray[(y - 1) * w + (x + 1)],
          gray[y * w + (x - 1)], gray[idx], gray[y * w + (x + 1)],
          gray[(y + 1) * w + (x - 1)], gray[(y + 1) * w + x], gray[(y + 1) * w + (x + 1)],
        ].sort((a, b) => a - b);
        denoised[idx] = neighbors[4];
      }
    }
    const result = ctx.createImageData(w, h);
    for (let i = 0, j = 0; i < result.data.length; i += 4, j++) {
      const val = Math.max(0, Math.min(255, denoised[j]));
      result.data[i] = val; result.data[i + 1] = val; result.data[i + 2] = val; result.data[i + 3] = 255;
    }
    ctx.putImageData(result, 0, 0);
    return;
  }

  if (mode === 'sharpen') {
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    const src = new Uint8ClampedArray(data);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let ki = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const idx = ((y + dy) * w + (x + dx)) * 4 + c;
              sum += src[idx] * kernel[ki++];
            }
          }
          const o = (y * w + x) * 4 + c;
          data[o] = Math.max(0, Math.min(255, sum));
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  if (mode === 'brightness') {
    const factor = 1.25;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * factor);
      data[i + 1] = Math.min(255, data[i + 1] * factor);
      data[i + 2] = Math.min(255, data[i + 2] * factor);
    }
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  if (mode === 'contrast') {
    const c = 1.4;
    const intercept = 128 * (1 - c);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, data[i] * c + intercept));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * c + intercept));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * c + intercept));
    }
    ctx.putImageData(imageData, 0, 0);
    return;
  }
}

function EnhancedImageViewer({ url, fileName, mode, onEnhanced }: {
  url: string;
  fileName: string;
  mode: ImageMode;
  onEnhanced: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    setProcessedUrl(null);
  }, [url]);

  const cbRef = useRef(onEnhanced);
  cbRef.current = onEnhanced;

  useEffect(() => {
    if (mode === 'none') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        processImageCanvas(img, canvas, mode);
        const dataUrl = canvas.toDataURL('image/png');
        setProcessedUrl(dataUrl);
        cbRef.current(dataUrl);
        setReady(true);
      } catch {
        setReady(false);
      }
    };
    img.onerror = () => setReady(false);
    img.src = url;
  }, [mode, url]);

  if (mode !== 'none') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        {!ready && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-medium">جاري تحسين الصورة...</span>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        {processedUrl && (
          <img src={processedUrl} alt={fileName} className="max-h-full max-w-full rounded-lg shadow-lg" />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <img src={url} alt={fileName} className="max-h-full max-w-full rounded-lg shadow-lg" onLoad={() => cbRef.current('')} />
    </div>
  );
}

export default function FileViewer({ open, onClose, files, recordId, recordTitle }: FileViewerProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [highlights, setHighlights] = useState<FileHighlight[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const [selectedColor, setSelectedColor] = useState('yellow');
  const [showHighlightMode, setShowHighlightMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [textCopied, setTextCopied] = useState(false);
  const [whatsappCopied, setWhatsappCopied] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [savingText, setSavingText] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printScope, setPrintScope] = useState<'current' | 'all'>('all');
  const [allUrlsCopied, setAllUrlsCopied] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [officeFailed, setOfficeFailed] = useState(false);
  const [officeLoading, setOfficeLoading] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [currentPageText, setCurrentPageText] = useState('');
  const [imageMode, setImageMode] = useState<ImageMode>('none');
  const [enhancedDataUrl, setEnhancedDataUrl] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const [imageSaved, setImageSaved] = useState(false);
  const [actionStack, setActionStack] = useState<EditAction[]>([]);
  const [eraserMode, setEraserMode] = useState(false);
  const [eraserSize, setEraserSize] = useState(20);
  const [eraserStrokes, setEraserStrokes] = useState<EraserStroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const eraserCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imageText, setImageText] = useState('');
  const [rectMode, setRectMode] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [rectRenderList, setRectRenderList] = useState<{ h: FileHighlight; style: React.CSSProperties }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const activeFile = files[activeIdx];

  const fetchHighlights = useCallback(async () => {
    if (!activeFile) return;
    setLoadingHighlights(true);
    const { data } = await supabase
      .from('file_highlights')
      .select('*')
      .eq('file_id', activeFile.id)
      .order('created_at', { ascending: false });
    setHighlights(data ?? []);
    setLoadingHighlights(false);
  }, [activeFile?.id]);

  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      setShowHighlightMode(false);
      setEditingText(false);
      setPdfFailed(false);
      setOfficeFailed(false);
      setPdfPageCount(0);
      setCurrentPdfPage(1);
      setCurrentPageText('');
      setImageMode('none');
      setEnhancedDataUrl(null);
      setImageLoaded(false);
      setRectRenderList([]);
      setImageSaved(false);
      setActionStack([]);
      setImageText('');
      setRectMode(false);
      setDrawStart(null);
      setDrawRect(null);
      setEraserMode(false);
      setEraserStrokes([]);
      setIsDrawing(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !activeFile) return;
    fetchHighlights();
    setPdfFailed(false);
    setOfficeFailed(false);
    setImageLoaded(false);
    setImageMode('none');

    if (isPdfFile(activeFile)) {
      setPdfLoading(true);
      const t = setTimeout(() => setPdfLoading(false), 20_000);
      return () => clearTimeout(t);
    } else if (isWordFile(activeFile) || isExcelFile(activeFile)) {
      setOfficeLoading(true);
      const t = setTimeout(() => setOfficeLoading(false), 20_000);
      return () => clearTimeout(t);
    } else if (isTextFile(activeFile)) {
      fetch(getFileUrl(activeFile.file_path))
        .then((r) => r.text())
        .then(setTextContent)
        .catch(() => setTextContent(''));
    }
  }, [open, activeFile?.id, fetchHighlights]);

  // Track visible PDF page on scroll + extract current page text
  useEffect(() => {
    if (!open || !isPdfFile(activeFile) || pdfFailed) return;
    const findContainer = () => document.querySelector('.flex.flex-1.flex-col.items-center.overflow-auto');
    let container = findContainer();
    if (!container) {
      const retry = setTimeout(() => {
        const c = findContainer();
        if (c) {
          const info = getVisiblePdfPageInfo();
          setCurrentPdfPage(info.page);
          setPdfPageCount(info.total);
          setCurrentPageText(info.text);
        }
      }, 500);
      return () => clearTimeout(retry);
    }
    const handleScroll = () => {
      const info = getVisiblePdfPageInfo();
      setCurrentPdfPage(info.page);
      setPdfPageCount(info.total);
      setCurrentPageText(info.text);
    };
    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [open, activeFile?.id, pdfFailed, pdfLoading]);

  // Force inline styles on PDF text layers + canvases as they appear (inline > stylesheet)
  useEffect(() => {
    if (!open) return;
    const styleTextLayer = (el: HTMLElement) => {
      el.style.setProperty('pointer-events', 'auto', 'important');
      el.style.setProperty('user-select', 'text', 'important');
      el.style.setProperty('-webkit-user-select', 'text', 'important');
      el.style.setProperty('z-index', '10', 'important');
      el.style.setProperty('opacity', '1', 'important');
    };
    const styleTextSpan = (el: HTMLElement) => {
      el.style.setProperty('pointer-events', 'auto', 'important');
      el.style.setProperty('user-select', 'text', 'important');
      el.style.setProperty('-webkit-user-select', 'text', 'important');
      el.style.setProperty('cursor', 'text', 'important');
      el.style.setProperty('color', 'transparent', 'important');
    };
    const styleCanvas = (el: HTMLElement) => {
      el.style.setProperty('pointer-events', 'none', 'important');
    };
    const applyInline = (root: Element | Document) => {
      root.querySelectorAll('.pdf-text-layer, .textLayer, .react-pdf__Page__textContent').forEach((el) => styleTextLayer(el as HTMLElement));
      root.querySelectorAll('.pdf-text-layer span, .textLayer span').forEach((el) => styleTextSpan(el as HTMLElement));
      root.querySelectorAll('canvas').forEach(styleCanvas);
      if (root instanceof HTMLElement) {
        if (root.matches('.pdf-text-layer, .textLayer, .react-pdf__Page__textContent')) styleTextLayer(root);
        if (root.matches('.pdf-text-layer span, .textLayer span')) styleTextSpan(root);
        if (root.matches('canvas')) styleCanvas(root);
      }
    };
    applyInline(document);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === 1) applyInline(node as Element);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [open, activeFile?.id, pdfFailed]);

  // Recompute saved rectangle positions after image loads or highlights change
  useLayoutEffect(() => {
    if (!isImageFile(activeFile) || !imageLoaded) {
      setRectRenderList([]);
      return;
    }
    const wrapper = imageWrapperRef.current;
    const imgEl = wrapper?.querySelector('img');
    if (!wrapper || !imgEl) return;
    const imgRect = imgEl.getBoundingClientRect();
    const wrapRect = wrapper.getBoundingClientRect();
    const offsetX = imgRect.left - wrapRect.left;
    const offsetY = imgRect.top - wrapRect.top;
    const list: { h: FileHighlight; style: React.CSSProperties }[] = [];
    for (const h of highlights) {
      if (!h.selected_text.startsWith('__rect__:')) continue;
      try {
        const coords = JSON.parse(h.selected_text.replace('__rect__:', ''));
        list.push({
          h,
          style: {
            left: `${offsetX + coords.x * imgRect.width}px`,
            top: `${offsetY + coords.y * imgRect.height}px`,
            width: `${coords.w * imgRect.width}px`,
            height: `${coords.h * imgRect.height}px`,
          },
        });
      } catch { /* skip */ }
    }
    setRectRenderList(list);
  }, [highlights, imageLoaded, activeFile?.id, imageMode, open]);

  // Recompute on window resize
  useEffect(() => {
    if (!isImageFile(activeFile) || !imageLoaded) return;
    const handler = () => setImageLoaded(x => x); // trigger re-layout
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [activeFile?.id, imageLoaded]);

  if (!open || !activeFile) return null;

  const addHighlight = async () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || !activeFile) return;
    const input: FileHighlightInput = {
      file_id: activeFile.id,
      record_id: recordId,
      selected_text: text,
      color: selectedColor,
    };
    const { data } = await supabase.from('file_highlights').insert(input).select().single();
    if (data) {
      setHighlights([data, ...highlights]);
      setActionStack([...actionStack, { type: 'highlight', data }]);
    }
    selection?.removeAllRanges();
  };

  const handleRectMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!rectMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = 'touches' in e ? e.touches[0] : e;
    setDrawStart({ x: pt.clientX - rect.left, y: pt.clientY - rect.top });
    setDrawRect({ x: pt.clientX - rect.left, y: pt.clientY - rect.top, w: 0, h: 0 });
  };

  const handleRectMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = 'touches' in e ? e.touches[0] : e;
    const x = pt.clientX - rect.left;
    const y = pt.clientY - rect.top;
    setDrawRect({
      x: Math.min(drawStart.x, x),
      y: Math.min(drawStart.y, y),
      w: Math.abs(x - drawStart.x),
      h: Math.abs(y - drawStart.y),
    });
  };

  const handleRectMouseUp = async () => {
    if (!drawRect || drawRect.w < 5 || drawRect.h < 5) {
      setDrawStart(null);
      setDrawRect(null);
      return;
    }
    const imgEl = imageWrapperRef.current?.querySelector('img');
    if (!imgEl || !activeFile) {
      setDrawStart(null);
      setDrawRect(null);
      return;
    }
    const imgRect = imgEl.getBoundingClientRect();
    const containerEl = imageWrapperRef.current!;
    const contRect = containerEl.getBoundingClientRect();
    const offsetX = imgRect.left - contRect.left;
    const offsetY = imgRect.top - contRect.top;
    const relRect = {
      x: (drawRect.x - offsetX) / imgRect.width,
      y: (drawRect.y - offsetY) / imgRect.height,
      w: drawRect.w / imgRect.width,
      h: drawRect.h / imgRect.height,
    };
    if (relRect.x < 0 || relRect.y < 0 || relRect.x + relRect.w > 1.01 || relRect.y + relRect.h > 1.01) {
      setDrawStart(null);
      setDrawRect(null);
      return;
    }
    const input: FileHighlightInput = {
      file_id: activeFile.id,
      record_id: recordId,
      selected_text: `__rect__:${JSON.stringify(relRect)}`,
      color: selectedColor,
    };
    const { data } = await supabase.from('file_highlights').insert(input).select().single();
    if (data) {
      setHighlights([data, ...highlights]);
      setActionStack([...actionStack, { type: 'highlight', data }]);
    }
    setDrawStart(null);
    setDrawRect(null);
  };

  const deleteHighlight = async (id: string) => {
    await supabase.from('file_highlights').delete().eq('id', id);
    setHighlights(highlights.filter((h) => h.id !== id));
  };

  const updateHighlightNote = async (id: string, note: string) => {
    await supabase.from('file_highlights').update({ note }).eq('id', id);
    setHighlights(highlights.map((h) => (h.id === id ? { ...h, note } : h)));
  };

  const handleCopy = async () => {
    if (isTextFile(activeFile) && textContent) {
      await navigator.clipboard.writeText(textContent);
    } else {
      await navigator.clipboard.writeText(getFileUrl(activeFile.file_path));
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySelectedText = async () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text) {
      setTextCopied(false);
      return;
    }
    await navigator.clipboard.writeText(text);
    setTextCopied(true);
    setTimeout(() => setTextCopied(false), 2000);
  };

  const handleShareWhatsApp = async () => {
    let shareText = '';
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText) {
      // Share only the selected text snippet
      shareText = selectedText;
    } else if (isPdfFile(activeFile)) {
      // Share ONLY the current page text, not the full document
      const info = getVisiblePdfPageInfo();
      const page = info.page || currentPdfPage || 1;
      const pageText = info.text || currentPageText || '';
      const snippet = pageText.length > 800 ? pageText.slice(0, 800) + '...' : pageText;
      shareText = `📄 ${activeFile.file_name}\n📋 ${recordTitle}\n🔖 الصفحة ${page}${pdfPageCount > 0 ? ` من ${pdfPageCount}` : ''}\n\n${snippet || '(لا يوجد نص قابل للاستخراج في هذه الصفحة)'}`;
    } else if (isWordFile(activeFile)) {
      // Extract visible text from the Word HTML container
      const wordContainer = document.querySelector('.prose');
      const wordText = wordContainer ? (wordContainer.textContent || '').replace(/\s+/g, ' ').trim() : '';
      const snippet = wordText.length > 800 ? wordText.slice(0, 800) + '...' : wordText;
      shareText = `📄 ${activeFile.file_name}\n📋 ${recordTitle}\n\n${snippet || '(لا يوجد نص)'}`;
    } else if (isExcelFile(activeFile)) {
      // Extract visible text from the active Excel sheet
      const excelContainer = document.querySelector('.flex-1.overflow-auto.p-4');
      const excelText = excelContainer ? (excelContainer.textContent || '').replace(/\s+/g, ' ').trim() : '';
      const snippet = excelText.length > 800 ? excelText.slice(0, 800) + '...' : excelText;
      shareText = `📊 ${activeFile.file_name}\n📋 ${recordTitle}\n\n${snippet || '(لا توجد بيانات)'}`;
    } else if (isTextFile(activeFile) && textContent) {
      const snippet = textContent.length > 800 ? textContent.slice(0, 800) + '...' : textContent;
      shareText = `📄 ${activeFile.file_name}\n📋 ${recordTitle}\n\n${snippet}`;
    } else {
      shareText = `📄 ${activeFile.file_name}\n📋 ${recordTitle}`;
    }

    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setWhatsappCopied(true);
    setTimeout(() => setWhatsappCopied(false), 2000);
  };

  const handleCopyAllUrls = async () => {
    const urls = files.map((f) => `${f.file_name}: ${getFileUrl(f.file_path)}`).join('\n');
    await navigator.clipboard.writeText(urls);
    setAllUrlsCopied(true);
    setTimeout(() => setAllUrlsCopied(false), 2000);
  };

  const handleSaveText = async () => {
    if (!activeFile) return;
    setSavingText(true);
    try {
      const blob = new Blob([textContent], { type: activeFile.file_type ?? 'text/plain' });
      const { error: upErr } = await supabase.storage.from('archive-files').upload(activeFile.file_path, blob, { upsert: true });
      if (upErr) throw upErr;
      const { invalidateThumbnail } = await import('@/lib/thumbnails');
      await invalidateThumbnail(activeFile);
      setEditingText(false);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSavingText(false);
    }
  };

  const handleDownload = () => {
    const url = getFileUrl(activeFile.file_path);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.file_name;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAllZip = async () => {
    if (files.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const folderName = recordTitle.replace(/[\\/:*?"<>|]/g, '_') || 'ملفات';
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

  const handlePrint = () => {
    setShowPrintDialog(true);
  };

  const handleSaveImage = async () => {
    if (!enhancedDataUrl || !activeFile) return;
    setSavingImage(true);
    try {
      const res = await fetch(enhancedDataUrl);
      const blob = await res.blob();
      const { error: upErr } = await supabase.storage.from('archive-files').upload(activeFile.file_path, blob, { upsert: true });
      if (upErr) throw upErr;
      const { invalidateThumbnail } = await import('@/lib/thumbnails');
      await invalidateThumbnail(activeFile);
      setImageSaved(true);
      setTimeout(() => setImageSaved(false), 3000);
    } catch (err) {
      console.error('Image save failed:', err);
    } finally {
      setSavingImage(false);
    }
  };

  const handleUndo = async () => {
    const last = actionStack[actionStack.length - 1];
    if (!last) return;
    if (last.type === 'highlight') {
      await supabase.from('file_highlights').delete().eq('id', last.data.id);
      setHighlights(highlights.filter((h) => h.id !== last.data.id));
    } else if (last.type === 'imageMode') {
      setImageMode(last.prevMode);
      setEnhancedDataUrl(last.prevDataUrl);
    } else if (last.type === 'eraser') {
      setEnhancedDataUrl(last.prevDataUrl);
      setEraserStrokes([]);
    }
    setActionStack(actionStack.slice(0, -1));
  };

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !recordId) return;
    const ext = file.name.split('.').pop() ?? 'jpg';
    const filePath = `${recordId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('archive-files').upload(filePath, file);
    if (upErr) return;
    await supabase.from('record_files').insert({
      record_id: recordId,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type,
      file_size: file.size,
    });
    window.location.reload();
  };

  const executePrint = () => {
    const url = getFileUrl(activeFile.file_path);
    if (isPdfFile(activeFile)) {
      if (printScope === 'current') {
        const page = currentPdfPage || 1;
        window.open(`${url}#page=${page}`, '_blank');
      } else {
        window.open(url, '_blank');
      }
    } else if (isImageFile(activeFile)) {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(`<html dir="rtl"><head><title>طباعة</title><style>@page{margin:1cm}img{max-width:100%;display:block;margin:0 auto}</style></head><body><img src="${url}" onload="window.print()"/></body></html>`);
        w.document.close();
      }
    } else if (isTextFile(activeFile)) {
      const w = window.open('', '_blank');
      if (w) {
        const escaped = textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        w.document.write(`<html dir="rtl"><head><title>طباعة</title><style>body{font-family:monospace;padding:2cm;white-space:pre-wrap}</style></head><body onload="window.print()">${escaped}</body></html>`);
        w.document.close();
      }
    } else {
      window.open(url, '_blank');
    }
    setShowPrintDialog(false);
  };

  const fileUrl = getFileUrl(activeFile.file_path);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4">
      <style>{`
        .react-pdf__Page__textContent, .textLayer, .pdf-text-layer {
          pointer-events: auto !important;
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          z-index: 10 !important;
          opacity: 1 !important;
        }
        .pdf-text-layer span {
          color: transparent !important;
          cursor: text !important;
          pointer-events: auto !important;
          user-select: text !important;
          -webkit-user-select: text !important;
        }
        .pdf-text-layer span::selection {
          background: rgba(0, 100, 255, 0.45) !important;
          color: transparent !important;
        }
        .pdf-text-layer span::-moz-selection {
          background: rgba(0, 100, 255, 0.45) !important;
          color: transparent !important;
        }
        canvas {
          pointer-events: none !important;
        }
        .prose, .flex-1.overflow-auto.p-4 {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          cursor: text !important;
        }
        .prose p, .prose td, .prose th,
        .flex-1.overflow-auto.p-4 td, .flex-1.overflow-auto.p-4 th {
          user-select: text !important;
          -webkit-user-select: text !important;
        }
      `}</style>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              {isImageFile(activeFile) ? <ImageIcon size={18} /> : isPdfFile(activeFile) ? <FileText size={18} /> : isWordFile(activeFile) ? <FileText size={18} /> : isExcelFile(activeFile) ? <FileSpreadsheet size={18} /> : <FileIcon size={18} />}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-slate-800">{activeFile.file_name}</h2>
              <p className="truncate text-xs text-slate-400">
                {recordTitle}
                {isPdfFile(activeFile) && pdfPageCount > 0 && (
                  <span className="mr-2 text-slate-300">· صفحة {currentPdfPage} من {pdfPageCount}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <button onClick={handleCopySelectedText} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200" title="نسخ النص المحدد">
              {textCopied ? <Check size={14} className="text-emerald-500" /> : <ClipboardType size={14} />}
              <span className="hidden md:inline">{textCopied ? 'تم' : 'نسخ النص'}</span>
            </button>
            <button onClick={handleShareWhatsApp} className="flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100" title="مشاركة الصفحة الحالية عبر واتساب">
              {whatsappCopied ? <Check size={14} className="text-emerald-500" /> : <MessageCircle size={14} />}
              <span className="hidden md:inline">واتساب</span>
            </button>
            <button onClick={handleCopy} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200" title="نسخ الرابط">
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              <span className="hidden md:inline">{copied ? 'تم' : 'نسخ'}</span>
            </button>
            {files.length > 1 && (
              <button onClick={handleCopyAllUrls} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200" title="نسخ روابط جميع الملفات">
                {allUrlsCopied ? <Check size={14} className="text-emerald-500" /> : <Link2 size={14} />}
                <span className="hidden md:inline">{allUrlsCopied ? 'تم' : 'الروابط'}</span>
              </button>
            )}
            {isImageFile(activeFile) && (
              <>
                <button
                  onClick={() => setImageMode(imageMode === 'enhance' ? 'none' : 'enhance')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    imageMode === 'enhance' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title="تحسين جودة الصورة وتوضيح النص"
                >
                  <Sparkles size={14} />
                  <span className="hidden md:inline">{imageMode === 'enhance' ? 'إلغاء التحسين' : 'تحسين الصورة'}</span>
                </button>
                <button
                  onClick={() => setImageMode(imageMode === 'denoise' ? 'none' : 'denoise')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    imageMode === 'denoise' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title="إزالة بقع الخلفية والتشويش"
                >
                  <Eraser size={14} />
                  <span className="hidden md:inline">{imageMode === 'denoise' ? 'إلغاء' : 'إزالة التشويش'}</span>
                </button>
                <button
                  onClick={() => setImageMode(imageMode === 'sharpen' ? 'none' : 'sharpen')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    imageMode === 'sharpen' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title="توضيح وتشديد الحواف"
                >
                  <Zap size={14} />
                  <span className="hidden md:inline">{imageMode === 'sharpen' ? 'إلغاء' : 'توضيح'}</span>
                </button>
                <button
                  onClick={() => setImageMode(imageMode === 'brightness' ? 'none' : 'brightness')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    imageMode === 'brightness' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title="زيادة سطوع الصورة"
                >
                  <Sun size={14} />
                  <span className="hidden md:inline">{imageMode === 'brightness' ? 'إلغاء' : 'سطوع'}</span>
                </button>
                <button
                  onClick={() => setImageMode(imageMode === 'contrast' ? 'none' : 'contrast')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    imageMode === 'contrast' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title="زيادة تباين الصورة"
                >
                  <Contrast size={14} />
                  <span className="hidden md:inline">{imageMode === 'contrast' ? 'إلغاء' : 'تباين'}</span>
                </button>
                <button
                  onClick={handleSaveImage}
                  disabled={!enhancedDataUrl || savingImage}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="حفظ الصورة المحسنة"
                >
                  {savingImage ? <Loader2 size={14} className="animate-spin" /> : imageSaved ? <Check size={14} className="text-emerald-500" /> : <Save size={14} />}
                  <span className="hidden md:inline">{imageSaved ? 'تم الحفظ' : 'حفظ'}</span>
                </button>
                <button
                  onClick={handleUndo}
                  disabled={actionStack.length === 0}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="تراجع عن آخر إجراء"
                >
                  <Undo2 size={14} />
                  <span className="hidden md:inline">تراجع</span>
                </button>
              </>
            )}
            <button onClick={handleDownload} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200">
              <Download size={14} />
              <span className="hidden md:inline">تحميل</span>
            </button>
            {files.length > 1 && (
              <button onClick={handleDownloadAllZip} disabled={zipping} className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50" title="تحميل جميع الملفات كملف مضغوط">
                {zipping ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                <span className="hidden md:inline">{zipping ? 'جاري...' : 'تحميل الكل'}</span>
              </button>
            )}
            <button onClick={handlePrint} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200">
              <Printer size={14} />
              <span className="hidden md:inline">طباعة</span>
            </button>
            <button
              onClick={() => { setShowHighlightMode(!showHighlightMode); if (showHighlightMode) setRectMode(false); }}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                showHighlightMode ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Highlighter size={14} />
              <span className="hidden md:inline">تمييز</span>
            </button>
            {isTextFile(activeFile) && (
              <button
                onClick={() => (editingText ? handleSaveText() : setEditingText(true))}
                disabled={savingText}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  editingText ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {savingText ? <Loader2 size={14} className="animate-spin" /> : editingText ? <Save size={14} /> : <Pencil size={14} />}
                <span className="hidden md:inline">{editingText ? 'حفظ' : 'تعديل'}</span>
              </button>
            )}
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
              title="التقاط صورة من الكاميرا"
            >
              <Camera size={14} />
              <span className="hidden md:inline">كاميرا</span>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCameraCapture}
                className="hidden"
              />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Highlight toolbar */}
        {showHighlightMode && (
          <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 px-4 py-2">
            <span className="text-xs font-semibold text-amber-700">حدد نصاً ثم اختر لوناً:</span>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedColor(c.id)}
                className={`h-7 w-7 rounded-full ${c.bg} transition ${selectedColor === c.id ? 'ring-2 ring-slate-800 ring-offset-1' : 'opacity-70 hover:opacity-100'}`}
              />
            ))}
            <button
              onClick={() => setRectMode(!rectMode)}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                rectMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Square size={14} />
              {rectMode ? 'وضع المستطيل' : 'تمييز بمستطيل'}
            </button>
            <button onClick={addHighlight} className="mr-auto rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500">
              تمييز المحدد
            </button>
          </div>
        )}

        {/* File tabs */}
        {files.length > 1 && (
          <div className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50 px-3 py-2">
            {files.map((f, i) => (
              <button
                key={f.id}
                onClick={() => setActiveIdx(i)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  i === activeIdx ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                }`}
              >
                {isImageFile(f) ? <ImageIcon size={12} /> : <FileIcon size={12} />}
                <span className="max-w-32 truncate">{f.file_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main preview */}
          <div ref={containerRef} className="relative flex-1 overflow-auto bg-slate-50 p-4">
            {isImageFile(activeFile) ? (
              <div ref={imageWrapperRef} className="relative inline-flex h-full w-full items-center justify-center" data-img-loaded={imageLoaded}>
                <EnhancedImageViewer url={fileUrl} fileName={activeFile.file_name} mode={imageMode} onEnhanced={(d) => { const prev = enhancedDataUrl; setEnhancedDataUrl(d || null); if (d) setActionStack([...actionStack, { type: 'imageMode', prevMode: imageMode, prevDataUrl: prev }]); setImageLoaded(true); }} />
                {!imageLoaded && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-100 p-6">
                    <div className="h-full max-h-[80%] w-full max-w-2xl animate-pulse rounded-lg bg-slate-200" />
                  </div>
                )}
                {/* Rectangle drawing overlay — positioned over image area */}
                {showHighlightMode && rectMode && (
                  <div
                    className="absolute inset-0 cursor-crosshair"
                    style={{ zIndex: 20 }}
                    onMouseDown={handleRectMouseDown}
                    onMouseMove={handleRectMouseMove}
                    onMouseUp={handleRectMouseUp}
                    onMouseLeave={handleRectMouseUp}
                    onTouchStart={handleRectMouseDown}
                    onTouchMove={handleRectMouseMove}
                    onTouchEnd={handleRectMouseUp}
                  />
                )}
                {/* Active drawing rectangle */}
                {drawRect && (
                  <div
                    className="absolute pointer-events-none border-2"
                    style={{
                      left: `${drawRect.x}px`,
                      top: `${drawRect.y}px`,
                      width: `${drawRect.w}px`,
                      height: `${drawRect.h}px`,
                      zIndex: 25,
                      backgroundColor: RECT_COLORS[selectedColor] ?? RECT_COLORS.yellow,
                      borderColor: RECT_BORDERS[selectedColor] ?? RECT_BORDERS.yellow,
                    }}
                  />
                )}
                {/* Saved rectangle highlights — positioned relative to image via layout effect */}
                {rectRenderList.map(({ h, style }) => (
                  <div
                    key={h.id}
                    className="absolute pointer-events-none border-2"
                    style={{
                      ...style,
                      zIndex: 15,
                      backgroundColor: RECT_COLORS[h.color] ?? RECT_COLORS.yellow,
                      borderColor: RECT_BORDERS[h.color] ?? RECT_BORDERS.yellow,
                    }}
                  />
                ))}
              </div>
            ) : isPdfFile(activeFile) ? (
              pdfFailed ? (
                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                  <FileText size={48} className="mb-3" />
                  <p className="text-sm font-medium">تعذر عرض الملف في المعاينة</p>
                  <button onClick={handleDownload} className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700">
                    تحميل الملف
                  </button>
                </div>
              ) : (
                <Suspense fallback={<SkeletonLoader />}>
                  <PdfRenderer
                    url={fileUrl}
                    fileName={activeFile.file_name}
                    onReady={() => setPdfLoading(false)}
                  />
                </Suspense>
              )
            ) : isWordFile(activeFile) ? (
              officeFailed ? (
                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                  <FileText size={48} className="mb-3" />
                  <p className="text-sm font-medium">تعذر عرض ملف Word في المعاينة</p>
                  <button onClick={handleDownload} className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700">
                    تحميل الملف
                  </button>
                </div>
              ) : (
                <Suspense fallback={<SkeletonLoader />}>
                  <OfficeRenderer
                    url={fileUrl}
                    fileName={activeFile.file_name}
                    fileType="word"
                    onFailed={() => setOfficeFailed(true)}
                    onReady={() => setOfficeLoading(false)}
                  />
                </Suspense>
              )
            ) : isExcelFile(activeFile) ? (
              officeFailed ? (
                <div className="flex h-full flex-col items-center justify-center text-slate-400">
                  <FileSpreadsheet size={48} className="mb-3" />
                  <p className="text-sm font-medium">تعذر عرض ملف Excel في المعاينة</p>
                  <button onClick={handleDownload} className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700">
                    تحميل الملف
                  </button>
                </div>
              ) : (
                <Suspense fallback={<SkeletonLoader />}>
                  <OfficeRenderer
                    url={fileUrl}
                    fileName={activeFile.file_name}
                    fileType="excel"
                    onFailed={() => setOfficeFailed(true)}
                    onReady={() => setOfficeLoading(false)}
                  />
                </Suspense>
              )
            ) : isTextFile(activeFile) && editingText ? (
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="h-full w-full resize-none rounded-lg border border-slate-200 bg-white p-4 font-mono text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-200"
                dir="auto"
              />
            ) : isTextFile(activeFile) ? (
              <pre className="h-full overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 text-sm text-slate-700 ring-1 ring-slate-200" dir="auto">
                {textContent}
              </pre>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-slate-400">
                <FileIcon size={48} className="mb-3" />
                <p className="text-sm font-medium">لا تتوفر معاينة لهذا الملف</p>
                <button onClick={handleDownload} className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700">
                  تحميل الملف
                </button>
              </div>
            )}
          </div>

          {/* Highlights sidebar */}
          {(showHighlightMode || highlights.length > 0) && (
            <div className="w-72 shrink-0 overflow-y-auto border-r border-slate-100 bg-white">
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Highlighter size={16} className="text-amber-500" />
                  <h3 className="text-sm font-bold text-slate-700">التمييزات</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{highlights.length}</span>
                </div>
              </div>
              {loadingHighlights ? (
                <div className="p-4 text-center text-xs text-slate-400">جاري التحميل...</div>
              ) : highlights.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  {showHighlightMode ? (rectMode ? 'اسحب لرسم مستطيل على المعاينة' : 'حدد نصاً واضغط "تمييز المحدد"') : 'لا توجد تمييزات'}
                </div>
              ) : (
                <div className="space-y-2 p-3">
                  {highlights.map((h) => {
                    const cc = getColorClasses(h.color);
                    return (
                      <div key={h.id} className={`rounded-lg ${cc.bg} p-3`}>
                        <p className={`text-sm font-medium ${cc.text}`} dir="auto">
                          {h.selected_text.startsWith('__rect__:') ? 'منطقة محددة' : h.selected_text}
                        </p>
                        {h.note && <p className="mt-1 text-xs text-slate-500" dir="auto">{h.note}</p>}
                        <div className="mt-2 flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="ملاحظة..."
                            defaultValue={h.note ?? ''}
                            onBlur={(e) => { if (e.target.value !== h.note) updateHighlightNote(h.id, e.target.value); }}
                            className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:ring-1 focus:ring-slate-300"
                            dir="auto"
                          />
                          <button onClick={() => deleteHighlight(h.id)} className="rounded-md p-1 text-slate-400 transition hover:bg-rose-100 hover:text-rose-500">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Print dialog */}
      {showPrintDialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowPrintDialog(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-4 flex items-center gap-2">
              <Printer size={20} className="text-slate-600" />
              <h3 className="text-base font-bold text-slate-800">خيارات الطباعة</h3>
            </div>
            <div className="space-y-4">
              {isPdfFile(activeFile) && pdfPageCount > 0 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="printScope"
                      value="all"
                      checked={printScope === 'all'}
                      onChange={() => setPrintScope('all')}
                      className="h-4 w-4 accent-slate-800"
                    />
                    <span className="text-sm font-medium text-slate-700">طباعة جميع الصفحات ({pdfPageCount})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="printScope"
                      value="current"
                      checked={printScope === 'current'}
                      onChange={() => setPrintScope('current')}
                      className="h-4 w-4 accent-slate-800"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      طباعة الصفحة الحالية فقط (صفحة {currentPdfPage} من {pdfPageCount})
                    </span>
                  </label>
                </div>
              )}
              {(!isPdfFile(activeFile) || pdfPageCount === 0) && (
                <p className="text-sm text-slate-500">
                  سيتم فتح الملف في نافذة جديدة. استخدم خيارات الطباعة في المتصفح لتحديد الصفحات المطلوبة.
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowPrintDialog(false)} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                إلغاء
              </button>
              <button onClick={executePrint} className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-700">
                طباعة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
