import {
  Gavel, Mail, FileText, FileSignature, Image, Archive,
  Folder, BookOpen, Briefcase, ClipboardList, Stamp,
  type LucideIcon,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  gavel: Gavel,
  mail: Mail,
  'file-text': FileText,
  'file-signature': FileSignature,
  image: Image,
  archive: Archive,
  folder: Folder,
  'book-open': BookOpen,
  briefcase: Briefcase,
  'clipboard-list': ClipboardList,
  stamp: Stamp,
};

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; ring: string; dot: string; gradient: string }> = {
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    ring: 'ring-blue-500',
    dot: 'bg-blue-500',
    gradient: 'from-blue-500 to-blue-600',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    ring: 'ring-amber-500',
    dot: 'bg-amber-500',
    gradient: 'from-amber-500 to-amber-600',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    ring: 'ring-emerald-500',
    dot: 'bg-emerald-500',
    gradient: 'from-emerald-500 to-emerald-600',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    ring: 'ring-purple-500',
    dot: 'bg-purple-500',
    gradient: 'from-purple-500 to-purple-600',
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    ring: 'ring-rose-500',
    dot: 'bg-rose-500',
    gradient: 'from-rose-500 to-rose-600',
  },
  slate: {
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
    ring: 'ring-slate-500',
    dot: 'bg-slate-500',
    gradient: 'from-slate-500 to-slate-600',
  },
  cyan: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    ring: 'ring-cyan-500',
    dot: 'bg-cyan-500',
    gradient: 'from-cyan-500 to-cyan-600',
  },
  teal: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    ring: 'ring-teal-500',
    dot: 'bg-teal-500',
    gradient: 'from-teal-500 to-teal-600',
  },
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    ring: 'ring-indigo-500',
    dot: 'bg-indigo-500',
    gradient: 'from-indigo-500 to-indigo-600',
  },
  orange: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    ring: 'ring-orange-500',
    dot: 'bg-orange-500',
    gradient: 'from-orange-500 to-orange-600',
  },
};

export const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  active: { label: 'نشط', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  archived: { label: 'مؤرشف', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
  pending: { label: 'قيد الانتظار', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  draft: { label: 'مسودة', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
};

export const AVAILABLE_ICONS = [
  'gavel', 'mail', 'file-text', 'file-signature', 'image',
  'archive', 'folder', 'book-open', 'briefcase', 'clipboard-list', 'stamp',
];

export const AVAILABLE_COLORS = [
  'blue', 'amber', 'emerald', 'purple', 'rose', 'slate', 'cyan', 'teal', 'indigo', 'orange',
];

export function getCategoryColor(color: string) {
  return CATEGORY_COLORS[color] ?? CATEGORY_COLORS.slate;
}

export function getCategoryIcon(icon: string): LucideIcon {
  return CATEGORY_ICONS[icon] ?? Folder;
}
