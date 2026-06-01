// /api/analyze.js
// POST /api/analyze with { images: ["data:image/png;base64,..."] }
// Returns audit data extracted by Claude vision.
//
// IMPORTANT (Option B — "Claude reads, code sums"):
// Claude does NOT add brands together. For each platform screenshot it reports
// that brand's RAW metrics. The frontend groups by service and sums them, and
// recomputes ratios (ROAS/ACOS/CPC/CPM/CTR) from the totals. This keeps the
// arithmetic exact and consistent instead of relying on the model to add.

const ANALYSIS_PROMPT = `You are analyzing dashboard screenshots to build a reconciliation audit comparing Tableau (internal BI) against advertising platform consoles (Amazon Ads, Amazon DSP, Mercado Libre, etc.).

KEY CONTEXT: An advertiser often has MULTIPLE BRANDS / sub-accounts, and each brand has MULTIPLE SERVICES:
- Amazon: "Sponsored Products", "Sponsored Brands", "Display / Video / Audio"
- Mercado Libre: "Product Ads", "Brand Ads", "Display"
Tableau usually shows ONE aggregated figure per service (all brands combined). The platform console shows ONE screenshot per brand per service.

YOUR JOB IS TO READ, NOT TO SUM. For every platform screenshot, report that single brand's metrics EXACTLY as shown. Do NOT add brands together — the application sums them afterward. Only the Tableau side is the already-aggregated figure for the whole service.

Distinguishing screenshots:
- TABLEAU views: show filter controls like "Date / Campaign / Line Item / Categories", "Breakdown" panels, week buckets (W14-26), or a "Campaign Type" filter (Sponsored Products / Sponsored Brands / Sponsored Display). Associate each Tableau screenshot to a service via its Campaign Type filter or title.
- PLATFORM/console views: native consoles — Amazon ("Sponsored ads, Mexico", tabs "All | Sponsored Products | Sponsored Brands | Display, Video, & Audio", "<BRAND> REG" in the header) or Mercado Libre ("Campanhas", "Métricas atribuídas", "Investimento").

Identify across all images:
- account: the advertiser name (e.g. "3M Mexico", "Bachoco", "Biologic")
- surface: e.g. "Amazon Sponsored Ads · Tableau", "Amazon DSP · Tableau", "Mercado Libre · Tableau"
- period: the date range shown (e.g. "Apr 1 – Apr 30, 2026")
- platform: "Amazon" | "MeLi" | other
- platformLabel: short label for the platform side (e.g. "Amazon Ads", "MeLi platform", "Amazon DSP console")
- summary: 1-2 sentence narrative of the reconciliation result

Then GROUP BY SERVICE. For each service output an object with:
- service: the service name (e.g. "Sponsored Products")
- platformBrands: array with ONE entry per brand's platform screenshot for this service:
    { "brand": "<brand/account label, e.g. CHSD REG>", "metrics": { ...visible metrics... } }
- tableau: { ...the Tableau aggregated metrics for this service... }

Metric keys — use EXACTLY these when present: Spend, Sales, Revenue, Impressions, Clicks, Purchases, Units, DPV, ROAS, ACOS, CPC, CPM, CTR.
Synonym mapping: "Investimento"/"Inversión"→Spend; "Receita"→Revenue; "Vendas"/"Ventas"→Sales; "Impressões"/"Impresiones"→Impressions; "Cliques"/"Clics"→Clicks; "Compras"→Purchases; "Unidades"→Units.
Report raw numbers as shown (you may keep currency symbols and thousand separators, e.g. "MX$67,950", "1,150,000", "3.91", "25.56%"). Include only metrics actually visible on that screenshot.
If a service has only ONE brand, still put it as a single-element platformBrands array.
If a brand shows zero/no data, report "0" or "MX$0.00" — do NOT omit it.

CRITICAL: Respond with ONLY a single JSON object. No prose before or after, no markdown code fences. Start with { and end with }.

{
  "account": "3M Mexico",
  "surface": "Amazon Sponsored Ads · Tableau",
  "period": "Apr 1 – Apr 30, 2026",
  "platform": "Amazon",
  "platformLabel": "Amazon Ads",
  "summary": "Tableau shows spend and sales for Sponsored Products across all brands while platform consoles show zero for the period.",
  "groups": [
    {
      "service": "Sponsored Products",
      "platformBrands": [
        { "brand": "CHSD REG",  "metrics": { "Spend": "MX$0.00", "Sales": "MX$0.00", "Impressions": "0", "Clicks": "0" } },
        { "brand": "SOSD REG",  "metrics": { "Spend": "MX$0.00", "Sales": "MX$0.00", "Impressions": "0", "Clicks": "0" } },
        { "brand": "HCD REG",   "metrics": { "Spend": "MX$0.00", "Sales": "MX$0.00", "Impressions": "0", "Clicks": "0" } },
        { "brand": "CHIMD REG", "metrics": { "Spend": "MX$0.00", "Sales": "MX$0.00", "Impressions": "0", "Clicks": "0" } }
      ],
      "tableau": { "Spend": "MX$67,950", "Sales": "MX$270,000", "ROAS": "3.91", "ACOS": "25.56%", "Impressions": "1,150,000", "Clicks": "8,000", "CPC": "MX$8.53", "CTR": "0.69%" }
    }
  ]
}`;

function extractJson(text) {
  if (!text) return null;
  let s = String(text)
    .replace(/```json\s*\n?/gi, '')
    .replace(/```\s*\n?/g, '')
    .trim();
  try { return JSON.parse(s); } catch (_) {}
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
          source: { type: 'base64', media_type: m ? m[1] : 'image/png', data: data || '' },
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
        // Sonnet balances vision quality and cost. For hardest multi-brand
        // reads, switch to 'claude-opus-4-7'. Lowest cost: 'claude-haiku-4-5-20251001'.
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
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
        rawResponse: text.slice(0, 4000),
        stopReason: data.stop_reason || null,
      });
    }
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('analyze error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};
