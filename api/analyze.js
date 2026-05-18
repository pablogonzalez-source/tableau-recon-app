// /api/analyze.js
// POST /api/analyze with { images: ["data:image/png;base64,..."] }
// Returns parsed audit data extracted by Claude vision.

const ANALYSIS_PROMPT = `You are analyzing dashboard screenshots to build a reconciliation audit comparing Tableau (internal BI) against advertising platforms (Mercado Libre / Amazon Ads / Amazon DSP consoles).

Across all uploaded images, identify:
- The advertiser/brand name
- The advertising surface
- The date period
- Which screenshots are Tableau views vs platform/console views
- The metrics shown on each side (spend, sales, impressions, clicks, CPC, ROAS, etc.)
- Compute deltas as (tableau − platform) / platform * 100, formatted with sign and %

Status rules:
- "clean" if all rows within ±5%
- "warn" if some rows 5-20% off
- "issue" if any row > 20% off unexplained

deltaClass per row: "good" if |Δ| ≤ 5%, "meh" if 5-20%, "bad" if > 20%.

CRITICAL: Respond with ONLY a single JSON object. No prose before, no prose after, no markdown code fences. Start your response with { and end with }.

{
  "account": "name",
  "surface": "Mercado Libre · Tableau" or "Amazon Sponsored Ads · Tableau" or "Amazon DSP · Tableau",
  "period": "Apr 1 – Apr 30, 2026",
  "platformLabel": "MeLi platform" or "Amazon Ads" or "Amazon DSP console",
  "status": "clean" | "warn" | "issue",
  "statusLabel": "short < 30 chars label",
  "summary": "1-2 sentence narrative",
  "rows": [
    {"section":"...", "metric":"Spend", "platform":"$X", "tableau":"$Y", "delta":"+/-Z%", "deltaClass":"good|meh|bad", "note": "optional"}
  ]
}`;

function extractJson(text) {
  if (!text) return null;
  // Strip markdown code fences (json or plain) wherever they appear
  let s = String(text)
    .replace(/```json\s*\n?/gi, '')
    .replace(/```\s*\n?/g, '')
    .trim();
  // Try direct parse
  try { return JSON.parse(s); } catch (_) {}
  // Find first { and last } — Claude sometimes adds preamble/postamble
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images } = req.body || {};
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'images array is required' });
    }
    if (images.length > 20) {
      return res.status(400).json({ error: 'Up to 20 images per request' });
    }

    const content = [
      ...images.map((img) => {
        const [meta, data] = String(img).split(',');
        const m = meta && meta.match(/data:(.+?);base64/);
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: m ? m[1] : 'image/png',
            data: data || '',
          },
        };
      }),
      { type: 'text', text: ANALYSIS_PROMPT },
    ];

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Sonnet has a strong vision/cost balance. For top quality use
        // 'claude-opus-4-7'; for lowest cost 'claude-haiku-4-5-20251001'.
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(502).json({ error: `Anthropic ${r.status}: ${errText.slice(0, 400)}` });
    }

    const data = await r.json();
    const text = (data.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    const parsed = extractJson(text);
    if (!parsed) {
      return res.status(200).json({
        _parseError: true,
        rawResponse: text.slice(0, 3000),
        stopReason: data.stop_reason || null,
      });
    }
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('analyze error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Allow larger payloads — screenshots as base64 can be a few MB.
export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};
