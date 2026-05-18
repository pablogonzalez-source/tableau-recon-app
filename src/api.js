// src/api.js
// Tiny fetch wrapper. The frontend never talks to Supabase or Anthropic
// directly — every call goes through /api/* on Vercel.

async function json(res) {
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { detail = await res.text(); }
    throw new Error(`${res.status} ${res.statusText}${detail ? ': ' + detail : ''}`);
  }
  return res.json();
}

const headers = { 'Content-Type': 'application/json' };

export const api = {
  meta: {
    get:    () => fetch('/api/meta').then(json),
    update: (m) => fetch('/api/meta', { method: 'PUT', headers, body: JSON.stringify(m) }).then(json),
  },
  audits: {
    list:   () => fetch('/api/audits').then(json),
    save:   (a) => fetch('/api/audits', { method: 'POST', headers, body: JSON.stringify(a) }).then(json),
    delete: (id) => fetch(`/api/audits?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).then(json),
  },
  investigations: {
    list:   () => fetch('/api/investigations').then(json),
    save:   (i) => fetch('/api/investigations', { method: 'POST', headers, body: JSON.stringify(i) }).then(json),
    delete: (id) => fetch(`/api/investigations?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).then(json),
  },
  analyze: (images) => fetch('/api/analyze', {
    method: 'POST', headers, body: JSON.stringify({ images }),
  }).then(json),
};
