import { useEffect, useRef, useState } from 'react';
import { File as FileIcon, FileSpreadsheet, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import type { RecordFile } from '@/types';
import { getFileUrl } from '@/lib/storage';
import type { ThumbnailSource } from '@/lib/thumbnails';

type PreviewKind = 'image' | 'pdf' | 'word' | 'excel' | 'other';

function getPreviewKind(file: RecordFile): PreviewKind {
  const type = file.file_type ?? '';
  const name = file.file_name.toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.includes('word') || name.endsWith('.docx')) return 'word';
  if (type.includes('spreadsheet') || type.includes('excel') || /\.(xlsx|xls)$/.test(name)) return 'excel';
  return 'other';
}

const FALLBACK_STYLE: Record<PreviewKind, { Icon: typeof FileIcon; tone: string }> = {
  image: { Icon: ImageIcon, tone: 'text-slate-300' },
  pdf: { Icon: FileText, tone: 'text-rose-300' },
  word: { Icon: FileText, tone: 'text-blue-400' },
  excel: { Icon: FileSpreadsheet, tone: 'text-emerald-400' },
  other: { Icon: FileIcon, tone: 'text-slate-300' },
};

export default function FileThumbnail({ file }: { file: RecordFile }) {
  const kind = getPreviewKind(file);
  const thumbSource: ThumbnailSource | null = kind === 'image' || kind === 'pdf' ? kind : null;
  const [thumbPath, setThumbPath] = useState<string | null>(file.thumbnail_path);
  const [failed, setFailed] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setThumbPath(file.thumbnail_path);
    setFailed(false);
    setInView(false);
  }, [file.id, file.thumbnail_path]);

  const needsGeneration = thumbSource !== null && !thumbPath && !failed;

  useEffect(() => {
    const el = ref.current;
    if (!needsGeneration || !el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [needsGeneration]);

  useEffect(() => {
    if (!inView || !needsGeneration || !thumbSource) return;
    let cancelled = false;
    import('@/lib/thumbnails')
      .then(({ ensureThumbnail }) => ensureThumbnail(file, thumbSource))
      .then((path) => { if (!cancelled) setThumbPath(path); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [inView, needsGeneration, file, thumbSource]);

  const thumbUrl = thumbPath && !failed ? getFileUrl(thumbPath) : null;
  const { Icon, tone } = FALLBACK_STYLE[kind];
  const extension = (file.file_name.split('.').pop() ?? '').toUpperCase();

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center bg-slate-50">
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={file.file_name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
        />
      ) : needsGeneration && inView ? (
        <Loader2 size={18} className="animate-spin text-slate-300" />
      ) : (
        <div className="flex flex-col items-center">
          <Icon size={20} className={tone} />
          <span className="mt-1 text-[10px] font-medium text-slate-400">{extension}</span>
        </div>
      )}
    </div>
  );
}
