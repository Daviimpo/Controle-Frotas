import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

/** "oad-5041" / "OAD 5041" -> "OAD5041" */
export function normalizePlate(value?: string | null) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Exibição padrão: ABC-1234 / ABC-1D23 */
export function formatPlate(value?: string | null) {
  const n = normalizePlate(value);
  return n.length === 7 ? `${n.slice(0, 3)}-${n.slice(3)}` : n;
}

/** Retorna apenas os 5 últimos dígitos do número do CRT/Conhecimento */
export function crtLast5(value?: string | number | null) {
  return String(value ?? '').replace(/\D/g, '').slice(-5);
}

export function normalizeText(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function slugify(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function hoursSince(iso: string, now = Date.now()) {
  return (now - new Date(iso).getTime()) / 3_600_000;
}

export function timeAgo(iso?: string | null) {
  if (!iso) return '—';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `há ${h}h${mins % 60 ? ` ${mins % 60}min` : ''}`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const COUNTRY_LABEL: Record<string, string> = {
  BR: 'Brasil',
  AR: 'Argentina',
  UY: 'Uruguai',
  CL: 'Chile',
  PY: 'Paraguai',
};
