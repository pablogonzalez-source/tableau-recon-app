// /api/audits.js
// GET    /api/audits          — list all audits
// POST   /api/audits          — upsert one audit (body: full audit object)
// DELETE /api/audits?id=xxx   — delete by id
import { supabase, auditToClient, auditToDb } from './_lib/db.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('audits')
        .select('*')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json((data || []).map(auditToClient));
    }

    if (req.method === 'POST') {
      const audit = req.body;
      if (!audit || !audit.id || !audit.account || !audit.surface) {
        return res.status(400).json({ error: 'id, account and surface are required' });
      }
      const { data, error } = await supabase
        .from('audits')
        .upsert(auditToDb(audit), { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(auditToClient(data));
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id query param is required' });
      const { error } = await supabase.from('audits').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ deleted: true, id });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('audits error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Audits embed base64 evidence — let payloads be larger than the default.
export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};
