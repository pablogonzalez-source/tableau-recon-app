// /api/investigations.js
import { supabase, invToClient, invToDb } from './_lib/db.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('investigations')
        .select('*')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json((data || []).map(invToClient));
    }

    if (req.method === 'POST') {
      const inv = req.body;
      if (!inv || !inv.id || !inv.title) {
        return res.status(400).json({ error: 'id and title are required' });
      }
      const { data, error } = await supabase
        .from('investigations')
        .upsert(invToDb(inv), { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(invToClient(data));
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id query param is required' });
      const { error } = await supabase.from('investigations').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ deleted: true, id });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('investigations error:', err);
    return res.status(500).json({ error: err.message });
  }
}
