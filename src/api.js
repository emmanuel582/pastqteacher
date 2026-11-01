import { createClient } from '@supabase/supabase-js';
const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const auth =
  url && key ? createClient(url, key, { auth: { storageKey: 'pastq-teacher-auth' } }).auth : null;
export const mediaUrl = (value) => (value?.startsWith('/api/') ? `${base}${value}` : value);
export async function api(path, options = {}) {
  const session = auth ? (await auth.getSession()).data.session : null;
  const response = await fetch(`${base}/api${path}`, {
    ...options,
    headers: {
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(!(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    body:
      options.body instanceof FormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(data.error || 'The request could not be completed.'), {
      status: response.status,
    });
  return data;
}
export function exportCsv(rows, name) {
  if (!rows.length) return;
  const fields = [...new Set(rows.flatMap(Object.keys))];
  const escape = (v) => {
    let s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
    if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const csv = [fields, ...rows.map((r) => fields.map((k) => r[k]))]
    .map((row) => row.map(escape).join(','))
    .join('\r\n');
  const href = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })),
    a = document.createElement('a');
  a.href = href;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
