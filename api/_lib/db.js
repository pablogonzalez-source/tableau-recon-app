// /api/_lib/db.js
// Shared Supabase client + snake_case <-> camelCase mappers.
// (Filename starts with _ so Vercel doesn't expose it as a route.)
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export const auditToClient = (r) => ({
  id: r.id,
  client: r.client || '',
  account: r.account,
  surface: r.surface,
  period: r.period,
  status: r.status,
  statusLabel: r.status_label || '',
  summary: r.summary || '',
  platformLabel: r.platform_label || 'Platform',
  rows: r.rows || [],
  evidence: r.evidence || [],
  position: r.position ?? 0,
});

export const auditToDb = (a) => ({
  id: a.id,
  client: a.client || '',
  account: a.account,
  surface: a.surface,
  period: a.period || null,
  status: a.status || 'clean',
  status_label: a.statusLabel || '',
  summary: a.summary || '',
  platform_label: a.platformLabel || 'Platform',
  rows: a.rows || [],
  evidence: a.evidence || [],
  position: a.position ?? 0,
  updated_at: new Date().toISOString(),
});

export const invToClient = (r) => ({
  id: r.id,
  account: r.account || '',
  title: r.title,
  detail: r.detail || '',
  severity: r.severity,
  position: r.position ?? 0,
});

export const invToDb = (i) => ({
  id: i.id,
  account: i.account || '',
  title: i.title,
  detail: i.detail || '',
  severity: i.severity || 'med',
  position: i.position ?? 0,
  updated_at: new Date().toISOString(),
});

export const metaToClient = (r) => ({
  title: r.title || 'Tableau Reconciliation',
  subtitle: r.subtitle || '',
  period: r.period || '',
});
