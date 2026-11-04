export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  created_at: string;
}

export type RecordStatus = 'active' | 'archived' | 'pending' | 'draft';

export interface RecordFile {
  id: string;
  record_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  thumbnail_path: string | null;
  created_at: string;
}

export interface ArchiveRecord {
  id: string;
  title: string;
  description: string | null;
  reference_number: string | null;
  category_id: string | null;
  record_date: string;
  status: RecordStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ArchiveRecordInput {
  title: string;
  description?: string | null;
  reference_number?: string | null;
  category_id?: string | null;
  record_date: string;
  status: RecordStatus;
  tags?: string[];
}

export interface CategoryInput {
  name: string;
  color: string;
  icon: string;
}

export interface FileHighlight {
  id: string;
  file_id: string;
  record_id: string;
  selected_text: string;
  note: string | null;
  color: string;
  page: number | null;
  created_at: string;
}

export interface FileHighlightInput {
  file_id: string;
  record_id: string;
  selected_text: string;
  note?: string | null;
  color: string;
  page?: number | null;
}

export type SortField = 'record_date' | 'title' | 'created_at' | 'reference_number';
export type SortOrder = 'asc' | 'desc';
