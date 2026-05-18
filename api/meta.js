// /api/meta.js
import { supabase, metaToClient } from './_lib/db.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('meta')
        .select('*')
        .eq('id', 1)
        .single();
      if (error) throw error;
      return res.status(200).json(metaToClient(data));
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const m = req.body || {};
      const { data, error } = await supabase
        .from('meta')
        .upsert({
          id: 1,
          title: m.title || 'Tableau Reconciliation',
          subtitle: m.subtitle || '',
          period: m.period || '',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(metaToClient(data));
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('meta error:', err);
    return res.status(500).json({ error: err.message });
  }
}
