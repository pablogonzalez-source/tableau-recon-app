// /api/vocabulary.js
// GET   /api/vocabulary  → returns { account: [...], surface: [...], section: [...], metric: [...], platform_label: [...], status_label: [...] }
// POST  /api/vocabulary  → bumps or inserts terms. Body: { learnings: [{ category, term }, ...] }
//                          Returns the updated grouped vocabulary.
import { supabase } from './_lib/db.js';

const EMPTY = { account: [], surface: [], platform_label: [], status_label: [], section: [], metric: [] };

async function fetchGrouped() {
  const { data, error } = await supabase
    .from('vocabulary')
    .select('category, term')
    .order('usage_count', { ascending: false })
    .order('last_used_at', { ascending: false });
  if (error) throw error;
  const grouped = { ...EMPTY };
  for (const row of (data || [])) {
    if (grouped[row.category]) grouped[row.category].push(row.term);
  }
  return grouped;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await fetchGrouped());
    }

    if (req.method === 'POST') {
      const { learnings } = req.body || {};
      if (!Array.isArray(learnings)) {
        return res.status(400).json({ error: 'learnings array is required' });
      }

      // Deduplicate within the batch (case-insensitive per category)
      const seen = new Set();
      const unique = [];
      for (const l of learnings) {
        if (!l || !l.term) continue;
        const term = String(l.term).trim();
        if (!term) continue;
        const key = `${l.category}::${term.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push({ category: l.category, term });
      }

      // For each, find existing or insert. Bump usage_count if found.
      for (const l of unique) {
        const { data: existing } = await supabase
          .from('vocabulary')
          .select('id, usage_count')
          .eq('category', l.category)
          .eq('term_lower', l.term.toLowerCase())
          .maybeSingle();
        if (existing) {
          await supabase
            .from('vocabulary')
            .update({ usage_count: existing.usage_count + 1, last_used_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase.from('vocabulary').insert({ category: l.category, term: l.term });
        }
      }

      return res.status(200).json(await fetchGrouped());
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('vocabulary error:', err);
    return res.status(500).json({ error: err.message });
  }
}
