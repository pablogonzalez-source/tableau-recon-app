import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Image as ImageIcon, Save, Upload, Eye, Database, Sparkles, Loader2, AlertCircle, ScanText, RefreshCw, GripVertical, Layers, ChevronDown } from 'lucide-react';
import { api } from './api.js';

// ─── DESIGN TOKENS ───
const T = {
  bg: '#0a0e1a', bgElev: '#131825', bgCard: '#161c2b', bgInput: '#0f1422',
  border: '#232a3d', borderLight: '#2d3548',
  text: '#e8eaf0', textSec: '#9aa3b8', textTer: '#6b7390',
  success: '#86c598', successSoft: 'rgba(134,197,152,0.08)',
  warning: '#d9b366', warningSoft: 'rgba(217,179,102,0.08)',
  danger: '#d97b78', dangerSoft: 'rgba(217,123,120,0.08)',
  accent: '#a78bfa', accentSoft: 'rgba(167,139,250,0.10)',
  teal: '#5eead4', tealSoft: 'rgba(94,234,212,0.10)',
  fontDisplay: "'Fraunces', Georgia, serif",
  fontBody: "'Geist', -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, monospace",
};

const DELTA_COLOR = { good: T.success, bad: T.danger, meh: T.warning };
const STATUS = {
  clean: { color: T.success, soft: T.successSoft },
  warn:  { color: T.warning, soft: T.warningSoft },
  issue: { color: T.danger,  soft: T.dangerSoft },
};
const EMPTY_VOCAB = { account: [], surface: [], platform_label: [], status_label: [], section: [], metric: [] };

// ─── HELPERS ───
const uid = () => 'id_' + Math.random().toString(36).slice(2, 10);
const blank = {
  audit: (period) => ({ id: uid(), client: '', account: '', surface: '', period: period || '', status: 'clean', statusLabel: '', summary: '', platformLabel: 'Platform', rows: [], evidence: [] }),
  row:   () => ({ id: uid(), section: '', metric: '', platform: '', tableau: '', delta: '', deltaClass: 'good', note: '' }),
  inv:   () => ({ id: uid(), account: '', title: '', detail: '', severity: 'med' }),
};
const fileToDataUri = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

// ─── OCR LOGIC ───
const BUILT_IN_KEYWORDS = {
  Spend:       ['spend', 'inversión', 'inversion', 'investimento', 'costo total', 'costo', 'cost'],
  Sales:       ['ad sales', 'sales', 'ventas', 'vendas'],
  Revenue:     ['revenue', 'ingresos', 'receita'],
  Impressions: ['impressions', 'impresiones', 'impressões', 'impressoes'],
  Clicks:      ['clicks', 'clics', 'cliques'],
  CPC:         ['avg cpc', 'cpc'],
  CPM:         ['avg cpm', 'cpm'],
  CTR:         ['ctr'],
  ROAS:        ['roas'],
  ACOS:        ['acos'],
  Purchases:   ['purchases', 'compras'],
  Units:       ['units', 'unidades'],
  DPV:         ['dpv', 'vistas de página', 'page views'],
};

const NUMBER_RE = /[-−+]?(?:[$€¥]\s*|USD\s*|US\$\s*|MX\$\s*|R\$\s*)?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?\s*(?:[KMB]|%|\$MX|MXN|USD)?/gi;

// Build extended keyword map: built-in + user-defined metrics from vocabulary
function buildKeywordMap(vocabMetrics = []) {
  const map = { ...BUILT_IN_KEYWORDS };
  for (const m of vocabMetrics) {
    if (!m) continue;
    if (!map[m]) map[m] = [m.toLowerCase()];
  }
  return map;
}

function extractMetricsFromText(text, keywordMap) {
  const lower = text.toLowerCase();
  const found = {};
  for (const [metric, keywords] of Object.entries(keywordMap)) {
    for (const kw of keywords) {
      const idx = lower.indexOf(kw);
      if (idx >= 0) {
        const snippet = text.slice(Math.max(0, idx - 25), Math.min(text.length, idx + 90));
        const matches = (snippet.match(NUMBER_RE) || []).map(s => s.trim()).filter(s => /\d/.test(s) && s.length >= 2);
        if (matches.length) {
          found[metric] = matches.slice(0, 3);
          break;
        }
      }
    }
  }
  return found;
}

// Auto-detection: find vocabulary terms inside the OCR text
function detectFromText(text, vocabulary) {
  const lower = (text || '').toLowerCase();
  const detected = {};
  for (const cat of ['account', 'surface', 'platform_label', 'section']) {
    const terms = vocabulary[cat] || [];
    for (const term of terms) {
      if (!term) continue;
      if (lower.includes(term.toLowerCase())) {
        detected[cat] = term; // most-used wins because list is sorted
        break;
      }
    }
  }
  return detected;
}

function parseNumber(str) {
  if (str === null || str === undefined) return null;
  let s = String(str).trim();
  if (!s) return null;
  let isNeg = /^[-−]/.test(s);
  s = s.replace(/^[-−+]/, '');
  // strip currency symbols and whitespace (incl. thin-space thousands separators)
  s = s.replace(/[$€¥]/g, '').replace(/\s/g, '').replace(/(?:MX\$|US\$|MXN|USD|R\$|MX)/gi, '');
  let mult = 1;
  const last = s.charAt(s.length - 1);
  if (/k/i.test(last)) { mult = 1e3; s = s.slice(0, -1); }
  else if (/m/i.test(last)) { mult = 1e6; s = s.slice(0, -1); }
  else if (/b/i.test(last)) { mult = 1e9; s = s.slice(0, -1); }
  else if (last === '%') { s = s.slice(0, -1); }

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Both present: the RIGHTMOST separator is the decimal point.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // European: 1.234,56
    } else {
      s = s.replace(/,/g, '');                    // US: 1,234.56
    }
  } else if (hasComma) {
    // Only commas. Decimal only if a single comma with 1–2 trailing digits (e.g. "0,69").
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');                  // thousands: 1,080,285 → 1080285
  } else if (hasDot) {
    // Only dots. Multiple dots = European thousands. A single dot with exactly 3
    // trailing digits is treated as thousands (1.080 → 1080); otherwise decimal.
    const parts = s.split('.');
    if (parts.length > 2) s = s.replace(/\./g, '');
    else if (parts.length === 2 && parts[1].length === 3) s = s.replace(/\./g, '');
    // else single dot with 1–2 (or 4+) trailing digits → leave as decimal (8.53, 1.15)
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return (isNeg ? -1 : 1) * n * mult;
}

function computeDelta(platformStr, tableauStr) {
  const p = parseNumber(platformStr);
  const t = parseNumber(tableauStr);
  if (p === null || t === null || p === 0) return { delta: '', deltaClass: 'good' };
  const pct = ((t - p) / p) * 100;
  const sign = pct > 0 ? '+' : '';
  const deltaStr = `${sign}${pct.toFixed(1)}%`;
  const abs = Math.abs(pct);
  const cls = abs <= 5 ? 'good' : abs <= 20 ? 'meh' : 'bad';
  return { delta: deltaStr, deltaClass: cls };
}

// ─── PLATFORM + SERVICE DETECTION ───
// Detects which ad platform a screenshot is from, by keywords in its OCR text.
const PLATFORM_PATTERNS = [
  { name: 'Amazon', kws: ['sponsored products', 'sponsored brands', 'sponsored ads', 'branded searches', 'detail page views', 'targeting performance', 'conversion path', 'ntb sales', 'create campaign', 'display, video', 'amazon'] },
  { name: 'MeLi',   kws: ['campanhas', 'métricas atribuídas', 'metricas atribuidas', 'investimento', 'painel ao vivo', 'data de ação', 'mercado', 'meli', 'productos patrocinados', 'product ads'] },
];
function detectPlatformFromText(text) {
  const lower = (text || '').toLowerCase();
  let best = '', bestCount = 0;
  for (const p of PLATFORM_PATTERNS) {
    let c = 0;
    for (const kw of p.kws) if (lower.includes(kw)) c++;
    if (c > bestCount) { bestCount = c; best = p.name; }
  }
  return bestCount >= 1 ? best : '';
}
function detectPlatformFromName(name) {
  const n = (name || '').toUpperCase();
  if (/AMS|AMAZON/.test(n)) return 'Amazon';
  if (/MELI|MLM|MERCADO/.test(n)) return 'MeLi';
  return '';
}
// Detects the service/campaign-type from the file name (e.g. "3M-SP-AMS-NEXCARE" → Sponsored Products)
function detectServiceFromName(name) {
  const n = (name || '').toUpperCase();
  if (/(^|[^A-Z])SP([^A-Z]|$)|SPONSORED.?PROD|PRODUCT.?AD/.test(n)) return 'Sponsored Products';
  if (/(^|[^A-Z])SB([^A-Z]|$)|SPONSORED.?BRAND|BRAND.?AD/.test(n)) return 'Sponsored Brands';
  if (/(^|[^A-Z])SD([^A-Z]|$)|DISPLAY|DVA|VIDEO/.test(n)) return 'Display / Video / Audio';
  return '';
}
// Builds the aggregation group label for a screenshot, combining platform + service.
function buildGroupLabel(platform, service) {
  if (platform && service) return `${platform} · ${service}`;
  return service || platform || '';
}
// Auto-suggest a group for a screenshot from its filename only (used at upload time, before OCR).
function suggestGroupFromName(name) {
  return buildGroupLabel(detectPlatformFromName(name), detectServiceFromName(name));
}

// ─── SMART AGGREGATION ───
// Additive metrics can be summed across brands. Ratio metrics must be RECOMPUTED from the sums.
const ADDITIVE_METRICS = ['Spend', 'Sales', 'Revenue', 'Impressions', 'Clicks', 'Purchases', 'Units', 'DPV'];
const PCT_METRICS = ['ACOS', 'CTR'];
const MONEY_RATIO_METRICS = ['CPC', 'CPM'];
const DERIVED_METRICS = {
  ROAS: (s) => (s.Spend > 0 ? (s.Sales || s.Revenue || 0) / s.Spend : null),
  ACOS: (s) => ((s.Sales || s.Revenue) > 0 ? (s.Spend / (s.Sales || s.Revenue)) * 100 : null),
  CPC:  (s) => (s.Clicks > 0 ? s.Spend / s.Clicks : null),
  CPM:  (s) => (s.Impressions > 0 ? (s.Spend / s.Impressions) * 1000 : null),
  CTR:  (s) => (s.Impressions > 0 ? (s.Clicks / s.Impressions) * 100 : null),
};
function formatNum(metric, n) {
  if (n === null || n === undefined || !isFinite(n)) return '';
  if (PCT_METRICS.includes(metric)) return n.toFixed(2) + '%';
  if (MONEY_RATIO_METRICS.includes(metric) || metric === 'ROAS') return n.toFixed(2);
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
// Aggregate one side (platform or tableau) of a group.
// If there's exactly one image and preferDirect is set, read its values verbatim.
// Otherwise sum the additive metrics and recompute the ratios from those sums.
function aggregateSide(images, { preferDirect }) {
  if (preferDirect && images.length === 1) {
    const out = {};
    for (const [m, vals] of Object.entries(images[0].metrics)) out[m] = vals[0];
    return out;
  }
  const sums = {};
  for (const img of images) {
    for (const [m, vals] of Object.entries(img.metrics)) {
      if (ADDITIVE_METRICS.includes(m)) {
        const v = parseNumber(vals[0]);
        if (v !== null) sums[m] = (sums[m] || 0) + v;
      }
    }
  }
  const out = {};
  for (const [m, v] of Object.entries(sums)) out[m] = formatNum(m, v);
  for (const [m, fn] of Object.entries(DERIVED_METRICS)) {
    const v = fn(sums);
    if (v !== null && isFinite(v)) out[m] = formatNum(m, v);
  }
  return out;
}

// ─── CLAUDE-VISION AGGREGATION (Option B: Claude reads per brand, code sums) ───
// Aggregate the platform side from Claude's per-brand breakdown.
// One brand → read its metrics verbatim. Multiple brands → sum additives, recompute ratios.
function aggregatePlatformBrands(brands) {
  const list = Array.isArray(brands) ? brands : [];
  if (list.length === 1) {
    return { ...(list[0].metrics || {}) };
  }
  const sums = {};
  for (const b of list) {
    const m = b.metrics || {};
    for (const [metric, valStr] of Object.entries(m)) {
      if (ADDITIVE_METRICS.includes(metric)) {
        const v = parseNumber(valStr);
        if (v !== null) sums[metric] = (sums[metric] || 0) + v;
      }
    }
  }
  const out = {};
  for (const [metric, v] of Object.entries(sums)) out[metric] = formatNum(metric, v);
  for (const [metric, fn] of Object.entries(DERIVED_METRICS)) {
    const v = fn(sums);
    if (v !== null && isFinite(v)) out[metric] = formatNum(metric, v);
  }
  return out;
}

// Turn Claude's grouped output into flat metric rows. Platform side is summed
// from the brand breakdown; tableau side is the aggregated figure Claude read.
function buildRowsFromGroups(groups) {
  const rows = [];
  const metricOrder = [...ADDITIVE_METRICS, 'ROAS', 'ACOS', 'CPC', 'CPM', 'CTR'];
  for (const g of (groups || [])) {
    const brands = g.platformBrands || [];
    const platformAgg = aggregatePlatformBrands(brands);
    const tableauAgg = g.tableau || {};
    const isCombined = brands.length > 1;
    const base = g.service || '';
    const section = isCombined ? `${base} — ALL BRANDS COMBINED` : base;
    const metrics = new Set([...Object.keys(platformAgg), ...Object.keys(tableauAgg)]);
    const ordered = metricOrder.filter((m) => metrics.has(m));
    const rest = [...metrics].filter((m) => !ordered.includes(m));
    for (const m of [...ordered, ...rest]) {
      const pStr = platformAgg[m] != null ? String(platformAgg[m]) : '';
      const tStr = tableauAgg[m] != null ? String(tableauAgg[m]) : '';
      if (!pStr && !tStr) continue;
      const { delta, deltaClass } = computeDelta(pStr, tStr);
      const note = isCombined
        ? `Σ of ${brands.length} brands${DERIVED_METRICS[m] ? ' (ratio recomputed)' : ''}`
        : '';
      rows.push({ id: uid(), section, metric: m, platform: pStr, tableau: tStr, delta, deltaClass, note });
    }
  }
  return rows;
}

function worstStatus(rows) {
  let s = 'clean';
  for (const r of rows) {
    if (r.deltaClass === 'bad') return 'issue';
    if (r.deltaClass === 'meh') s = 'warn';
  }
  return s;
}
function Btn({ children, onClick, variant = 'default', icon: Icon, size = 'md', style = {}, disabled, ...rest }) {
  const sizes = { sm: { padding: '6px 11px', fontSize: 10.5, gap: 6 }, md: { padding: '9px 16px', fontSize: 11, gap: 8 } };
  const variants = {
    default: { background: 'transparent', border: `1px solid ${T.borderLight}`, color: T.textSec },
    primary: { background: T.success, border: `1px solid ${T.success}`, color: '#0a0e1a' },
    accent:  { background: T.accent, border: `1px solid ${T.accent}`, color: '#0a0e1a' },
    teal:    { background: T.teal, border: `1px solid ${T.teal}`, color: '#0a0e1a' },
    danger:  { background: 'transparent', border: `1px solid ${T.danger}`, color: T.danger },
    ghost:   { background: 'transparent', border: '1px solid transparent', color: T.textSec },
  };
  const [hover, setHover] = useState(false);
  const base = variants[variant];
  const hov = hover && !disabled && (variant === 'default' || variant === 'ghost') ? { color: T.text, borderColor: T.textSec } : {};
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} {...rest} style={{
      ...sizes[size], ...base, ...hov,
      fontFamily: T.fontMono, textTransform: 'uppercase', letterSpacing: '0.14em',
      borderRadius: 2, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, transition: 'all 0.18s',
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
      ...style,
    }}>
      {Icon && <Icon size={size === 'sm' ? 12 : 13} style={{ marginRight: sizes[size].gap, flexShrink: 0 }} strokeWidth={1.5} />}
      <span>{children}</span>
    </button>
  );
}

function Input({ value, onChange, placeholder, multiline, mono, style = {} }) {
  const [focused, setFocused] = useState(false);
  const base = {
    width: '100%', background: T.bgInput, border: `1px solid ${focused ? T.textSec : T.border}`,
    color: T.text, padding: '10px 12px', fontSize: 13, fontFamily: mono ? T.fontMono : T.fontBody,
    borderRadius: 2, outline: 'none', resize: multiline ? 'vertical' : 'none',
    minHeight: multiline ? 80 : 'auto', lineHeight: 1.5, boxSizing: 'border-box', ...style,
  };
  const props = { value: value || '', onChange: (e) => onChange(e.target.value), placeholder, onFocus: () => setFocused(true), onBlur: () => setFocused(false), style: base };
  return multiline ? <textarea {...props} /> : <input {...props} />;
}

// Autocomplete input: like Input, but shows a dropdown of suggestions
// from the `suggestions` array. Filters by substring as you type.
function AutocompleteInput({ value, onChange, placeholder, suggestions = [], mono, style = {} }) {
  const [focused, setFocused] = useState(false);
  const [showList, setShowList] = useState(false);

  const filtered = useMemo(() => {
    const q = (value || '').toLowerCase().trim();
    if (!q) return suggestions.slice(0, 6);
    return suggestions.filter(s => s && s.toLowerCase().includes(q) && s.toLowerCase() !== q).slice(0, 6);
  }, [value, suggestions]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => { setFocused(true); setShowList(true); }}
        onBlur={() => { setFocused(false); setTimeout(() => setShowList(false), 160); }}
        style={{
          width: '100%', background: T.bgInput, border: `1px solid ${focused ? T.textSec : T.border}`,
          color: T.text, padding: '10px 12px', fontSize: 13,
          fontFamily: mono ? T.fontMono : T.fontBody,
          borderRadius: 2, outline: 'none', boxSizing: 'border-box', ...style,
        }}
      />
      {showList && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
          background: T.bgInput, border: `1px solid ${T.borderLight}`,
          borderRadius: 2, zIndex: 50, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
        }}>
          {filtered.map((s, i) => (
            <div
              key={i}
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setShowList(false); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.bgCard; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12.5, color: T.text, fontFamily: mono ? T.fontMono : T.fontBody, borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : 'none' }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Select({ value, onChange, options, style = {} }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} style={{
    background: T.bgInput, border: `1px solid ${T.border}`, color: T.text, padding: '10px 12px',
    fontSize: 13, fontFamily: T.fontMono, borderRadius: 2, outline: 'none', cursor: 'pointer', ...style,
  }}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

const Label = ({ children }) => <div style={{ fontFamily: T.fontMono, fontSize: 10.5, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>{children}</div>;

function Modal({ title, onClose, maxWidth = 900, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(5,8,14,0.88)', backdropFilter: 'blur(8px)', zIndex: 100, overflowY: 'auto', padding: '40px 20px' }}>
      <div style={{ maxWidth, margin: '0 auto', background: T.bgCard, border: `1px solid ${T.borderLight}`, borderRadius: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, padding: '20px 28px', borderBottom: `1px solid ${T.border}`, background: T.bgElev, position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em' }}>{title}</div>
          <Btn icon={X} onClick={onClose} size="sm">Close</Btn>
        </div>
        <div style={{ padding: 28 }}>{children}</div>
      </div>
    </div>
  );
}

function Header({ meta, onAdd, editMode, setEditMode, onEditMeta }) {
  const words = (meta.title || 'Tableau Reconciliation').split(' ');
  return (
    <header style={{ marginBottom: 56, paddingBottom: 32, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textTer, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 20 }}>Reconciliation App · multi-user</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap', marginBottom: 18 }}>
        <h1 style={{ fontFamily: T.fontDisplay, fontWeight: 400, fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 0.98, letterSpacing: '-0.035em', margin: 0 }}>
          {words.slice(0, -1).join(' ')} <em style={{ fontStyle: 'italic', fontWeight: 300, color: T.textSec }}>{words[words.length - 1]}</em>
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn icon={Pencil} onClick={onEditMeta} variant="ghost">Header</Btn>
          <Btn icon={editMode ? Eye : Pencil} onClick={() => setEditMode(!editMode)}>{editMode ? 'Done editing' : 'Edit mode'}</Btn>
          <Btn icon={Plus} onClick={onAdd} variant="primary">Add audit</Btn>
        </div>
      </div>
      <p style={{ color: T.textSec, fontSize: 15, maxWidth: '60ch', lineHeight: 1.65, marginBottom: 28 }}>{meta.subtitle}</p>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontFamily: T.fontMono, fontSize: 12, color: T.textSec }}>
        <div><span style={{ color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.12em', marginRight: 10 }}>Period</span>{meta.period || '—'}</div>
        <div><span style={{ color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.12em', marginRight: 10 }}>Today</span>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
      </div>
    </header>
  );
}

function Summary({ stats }) {
  const c = [
    { l: 'Audits', v: stats.total, color: T.text },
    { l: 'Clean', v: stats.clean, color: T.success },
    { l: 'Watch', v: stats.warn, color: T.warning },
    { l: 'Issue', v: stats.issue, color: T.danger },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: T.border, border: `1px solid ${T.border}`, marginBottom: 56 }}>
      {c.map((x) => (
        <div key={x.l} style={{ background: T.bgElev, padding: '28px 26px' }}>
          <div style={{ fontSize: 11, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: T.fontMono, marginBottom: 14 }}>{x.l}</div>
          <div style={{ fontFamily: T.fontDisplay, fontWeight: 400, fontSize: 44, lineHeight: 1, letterSpacing: '-0.02em', color: x.color }}>{x.v}</div>
        </div>
      ))}
    </div>
  );
}

const th = (n) => ({ textAlign: n ? 'right' : 'left', padding: '10px 14px 12px', borderBottom: `1px solid ${T.borderLight}`, color: T.textTer, fontWeight: 500, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: T.fontMono });
const td = { padding: '13px 14px', borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle' };

function MetricsTable({ rows, platformLabel }) {
  const hasNotes = rows.some((r) => r.note);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead><tr>
        <th style={th(false)}>Section</th><th style={th(false)}>Metric</th>
        <th style={th(true)}>{platformLabel}</th><th style={th(true)}>Tableau</th><th style={th(true)}>Δ</th>
        {hasNotes && <th style={th(false)}>Note</th>}
      </tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id}>
          <td style={{ ...td, color: T.textTer, fontFamily: T.fontMono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{r.section}</td>
          <td style={{ ...td, color: T.text, fontWeight: 500 }}>{r.metric}</td>
          <td style={{ ...td, textAlign: 'right', fontFamily: T.fontMono, color: T.textSec }}>{r.platform}</td>
          <td style={{ ...td, textAlign: 'right', fontFamily: T.fontMono, color: T.textSec }}>{r.tableau}</td>
          <td style={{ ...td, textAlign: 'right', fontFamily: T.fontMono, fontWeight: 500, color: DELTA_COLOR[r.deltaClass] || T.textSec }}>{r.delta}</td>
          {hasNotes && <td style={{ ...td, color: T.textTer, fontSize: 12, maxWidth: 220 }}>{r.note || ''}</td>}
        </tr>
      ))}</tbody>
    </table>
  );
}

function AuditCard({ audit, editMode, onEdit, onDelete, onViewEvidence, groupedView, groupKey }) {
  const s = STATUS[audit.status] || STATUS.clean;
  // In grouped view, show only the distinctive part: the account with the client
  // prefix stripped (e.g. "Vendor Inventory"), or the surface when nothing remains.
  const acc = (audit.account || '').trim();
  let distinctTitle = audit.surface || acc;
  if (groupKey && acc.toLowerCase().startsWith(groupKey.toLowerCase())) {
    const rest = acc.slice(groupKey.length).replace(/^[\s\-–—:·|]+/, '').trim();
    distinctTitle = rest || audit.surface || acc;
  }
  return (
    <article style={{ background: T.bgCard, border: groupedView ? 'none' : `1px solid ${T.border}`, borderLeft: `3px solid ${s.color}`, padding: '30px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
          {groupedView ? (
            <>
              <div style={{ fontFamily: T.fontDisplay, fontSize: 23, fontWeight: 400, letterSpacing: '-0.01em' }}>{distinctTitle}</div>
              {audit.surface && audit.surface !== distinctTitle && (
                <div style={{ fontFamily: T.fontMono, fontSize: 10.5, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.15em', padding: '5px 11px', border: `1px solid ${T.borderLight}`, borderRadius: 2 }}>{audit.surface}</div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontFamily: T.fontDisplay, fontSize: 30, fontWeight: 400, letterSpacing: '-0.015em' }}>{audit.account}</div>
              <div style={{ fontFamily: T.fontMono, fontSize: 10.5, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.15em', padding: '5px 11px', border: `1px solid ${T.borderLight}`, borderRadius: 2 }}>{audit.surface}</div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', padding: '7px 13px', borderRadius: 2, background: s.soft, color: s.color, whiteSpace: 'nowrap' }}>{audit.statusLabel}</div>
          {editMode && <><Btn icon={Pencil} onClick={() => onEdit(audit)} size="sm">Edit</Btn><Btn icon={Trash2} onClick={() => onDelete(audit)} variant="danger" size="sm">Del</Btn></>}
        </div>
      </div>
      <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textTer, marginBottom: 14 }}>{audit.period}</div>
      <p style={{ color: T.textSec, fontSize: 14, lineHeight: 1.65, marginBottom: 22, maxWidth: '70ch' }}>{audit.summary}</p>
      {audit.evidence?.length > 0 && (
        <Btn icon={ImageIcon} onClick={() => onViewEvidence(audit)} style={{ marginBottom: 26 }}>View evidence · {audit.evidence.length}</Btn>
      )}
      <MetricsTable rows={audit.rows || []} platformLabel={audit.platformLabel} />
    </article>
  );
}

const STATUS_ORDER = { clean: 1, warn: 2, issue: 3 };
function groupWorstStatus(items) {
  return items.reduce((w, a) => (STATUS_ORDER[a.status] || 1) > (STATUS_ORDER[w] || 1) ? a.status : w, 'clean');
}

// Collapsible client group: one client (account) with its surfaces/platforms inside.
function AccountGroup({ account, items, expanded, onToggle, editMode, onEdit, onDelete, onViewEvidence }) {
  const worst = groupWorstStatus(items);
  const s = STATUS[worst] || STATUS.clean;
  const counts = { clean: 0, warn: 0, issue: 0 };
  items.forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1; });
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '18px 24px', background: T.bgElev, border: 'none', borderLeft: `3px solid ${s.color}`, cursor: 'pointer', textAlign: 'left', fontFamily: T.fontBody }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <ChevronDown size={16} strokeWidth={1.5} style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s', color: T.textTer, flexShrink: 0 }} />
          <span style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 400, color: T.text, letterSpacing: '-0.015em' }}>{account}</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 10.5, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{items.length} {items.length === 1 ? 'surface' : 'surfaces'}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontFamily: T.fontMono, fontSize: 12 }}>
          {counts.clean > 0 && <span style={{ color: T.success }}>✓ {counts.clean}</span>}
          {counts.warn > 0 && <span style={{ color: T.warning }}>⚠ {counts.warn}</span>}
          {counts.issue > 0 && <span style={{ color: T.danger }}>✗ {counts.issue}</span>}
        </div>
      </button>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: T.border, borderTop: `1px solid ${T.border}` }}>
          {items.map((a) => (
            <AuditCard key={a.id} audit={a} groupedView groupKey={account} editMode={editMode} onEdit={onEdit} onDelete={onDelete} onViewEvidence={onViewEvidence} />
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceModal({ audit, onClose }) {
  return (
    <Modal title={<>Evidence · <em style={{ fontStyle: 'italic', color: T.textSec }}>{audit.account} · {audit.surface}</em></>} onClose={onClose} maxWidth={1080}>
      {(!audit.evidence || audit.evidence.length === 0) && <div style={{ color: T.textTer, fontStyle: 'italic' }}>No evidence attached.</div>}
      {(audit.evidence || []).map((ev, i, arr) => (
        <div key={ev.id} style={{ marginBottom: 36, paddingBottom: 36, borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none' }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{ev.label}{ev.type ? ` · ${ev.type}` : ''}</div>
          <div style={{ color: T.textSec, fontSize: 13.5, lineHeight: 1.6, marginBottom: 16, maxWidth: '75ch' }}>{ev.caption}</div>
          <img src={ev.src} alt={ev.label} style={{ maxWidth: '100%', height: 'auto', border: `1px solid ${T.border}`, borderRadius: 2, display: 'block' }} />
        </div>
      ))}
    </Modal>
  );
}

function AuditEditor({ audit, defaultPeriod, vocabulary, clientSuggestions = [], onSave, onClose }) {
  const [d, setD] = useState(audit || blank.audit(defaultPeriod));
  // Claude AI state
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiRaw, setAiRaw] = useState(null);
  // OCR state
  const [ocring, setOcring] = useState(false);
  const [ocrError, setOcrError] = useState(null);
  const [ocrStatus, setOcrStatus] = useState(null);
  // Detection feedback
  const [detectedNote, setDetectedNote] = useState(null);
  // Save state
  const [saving, setSaving] = useState(false);

  const upd = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const updRow = (id, k, v) => setD((p) => ({ ...p, rows: p.rows.map((r) => (r.id === id ? { ...r, [k]: v } : r)) }));
  const addRow = () => setD((p) => ({ ...p, rows: [...p.rows, blank.row()] }));
  const delRow = (id) => setD((p) => ({ ...p, rows: p.rows.filter((r) => r.id !== id) }));
  const updEv = (id, k, v) => setD((p) => ({ ...p, evidence: p.evidence.map((e) => (e.id === id ? { ...e, [k]: v } : e)) }));
  const delEv = (id) => setD((p) => ({ ...p, evidence: p.evidence.filter((e) => e.id !== id) }));

  // Drag-and-drop reordering of metric rows
  const [dragIdx, setDragIdx] = useState(null);
  const moveRow = (from, to) => {
    setD((prev) => {
      const rows = [...prev.rows];
      const [moved] = rows.splice(from, 1);
      rows.splice(to, 0, moved);
      return { ...prev, rows };
    });
  };

  const handleFiles = async (files) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const newEv = [];
    for (const f of list) {
      const src = await fileToDataUri(f);
      const label = f.name.replace(/\.[^/.]+$/, '');
      newEv.push({ id: uid(), src, label, caption: '', type: '', group: suggestGroupFromName(label) });
    }
    setD((p) => ({ ...p, evidence: [...p.evidence, ...newEv] }));
  };

  // ─── OCR EXTRACTION (in-browser) ───
  const runOcr = async () => {
    if (d.evidence.length === 0) { setOcrError('Add screenshots first.'); return; }
    const tagged = { tableau: d.evidence.filter(e => e.type === 'tableau'), platform: d.evidence.filter(e => e.type === 'platform') };
    if (tagged.tableau.length === 0 || tagged.platform.length === 0) {
      setOcrError('Tag at least one screenshot as Tableau and one as Platform (dropdown next to each image).');
      return;
    }
    if (!window.Tesseract) { setOcrError('Tesseract.js failed to load. Check internet/refresh.'); return; }

    setOcring(true); setOcrError(null); setAiError(null); setDetectedNote(null);
    const keywordMap = buildKeywordMap(vocabulary.metric);
    try {
      // 1. OCR every tagged image; detect platform + service + metrics + vocab terms
      const perImage = [];
      let i = 0;
      for (const ev of d.evidence) {
        i++;
        if (ev.type !== 'tableau' && ev.type !== 'platform') continue;
        setOcrStatus(`OCR ${i}/${d.evidence.length} · ${ev.label || 'unnamed'}…`);
        // eslint-disable-next-line no-await-in-loop
        const result = await window.Tesseract.recognize(ev.src, 'eng+spa+por');
        const text = result.data.text;
        const platform = detectPlatformFromName(ev.label) || detectPlatformFromText(text);
        const service = detectServiceFromName(ev.label);
        const autoGroup = buildGroupLabel(platform, service);
        const group = (ev.group && ev.group.trim()) ? ev.group.trim() : autoGroup;
        perImage.push({
          ev, text, platform, service, group, autoGroup,
          metrics: extractMetricsFromText(text, keywordMap),
          detected: detectFromText(text, vocabulary),
        });
      }

      // 2. Group images by their effective group label (service). Within a group,
      //    platform screenshots get summed; the tableau screenshot is the target.
      const groups = {};
      for (const item of perImage) {
        const key = item.group || '__ungrouped__';
        if (!groups[key]) groups[key] = { name: item.group || '', platform: [], tableau: [] };
        if (item.ev.type === 'platform') groups[key].platform.push(item);
        else if (item.ev.type === 'tableau') groups[key].tableau.push(item);
      }

      // 3. For each group: sum platform (recompute ratios), read tableau, build rows
      const newRows = [];
      const groupSummaries = [];
      const metricOrder = [...ADDITIVE_METRICS, 'ROAS', 'ACOS', 'CPC', 'CPM', 'CTR'];
      for (const key of Object.keys(groups)) {
        const g = groups[key];
        const platformAgg = aggregateSide(g.platform, { preferDirect: true });
        const tableauAgg  = aggregateSide(g.tableau,  { preferDirect: true });
        const metrics = new Set([...Object.keys(platformAgg), ...Object.keys(tableauAgg)]);
        const ordered = metricOrder.filter(m => metrics.has(m));
        const rest = [...metrics].filter(m => !ordered.includes(m));
        for (const m of [...ordered, ...rest]) {
          const pStr = platformAgg[m] || '';
          const tStr = tableauAgg[m] || '';
          if (!pStr && !tStr) continue;
          const { delta, deltaClass } = computeDelta(pStr, tStr);
          const brandCount = g.platform.length;
          const note = brandCount > 1 ? `Σ of ${brandCount} platform screenshots (ratios recomputed)` : '';
          newRows.push({ id: uid(), section: g.name, metric: m, platform: pStr, tableau: tStr, delta, deltaClass, note });
        }
        if (g.platform.length || g.tableau.length) {
          groupSummaries.push(`${g.name || 'ungrouped'} (${g.platform.length}P/${g.tableau.length}T)`);
        }
      }

      // 4. Auto-status from the worst delta
      let autoStatus = 'clean';
      for (const r of newRows) {
        if (r.deltaClass === 'bad') { autoStatus = 'issue'; break; }
        if (r.deltaClass === 'meh') autoStatus = 'warn';
      }

      // 5. Global vocab detection + platforms found
      const allText = perImage.map(p => p.text).join('\n');
      const topDetect = detectFromText(allText, vocabulary);
      const platformsDetected = [...new Set(perImage.map(p => p.platform).filter(Boolean))];

      // 6. Apply: backfill empty evidence groups, append rows, fill empty header fields
      setD(prev => ({
        ...prev,
        account: prev.account || topDetect.account || '',
        surface: prev.surface || topDetect.surface || '',
        platformLabel: (!prev.platformLabel || prev.platformLabel === 'Platform') ? (topDetect.platform_label || prev.platformLabel) : prev.platformLabel,
        evidence: prev.evidence.map(e => {
          const item = perImage.find(p => p.ev.id === e.id);
          if (item && (!e.group || !e.group.trim()) && item.autoGroup) return { ...e, group: item.autoGroup };
          return e;
        }),
        rows: [...prev.rows, ...newRows],
        status: prev.rows.length === 0 ? autoStatus : prev.status,
      }));

      // 7. Feedback note
      const hits = [];
      if (platformsDetected.length) hits.push(`Platforms: ${platformsDetected.join(', ')}`);
      if (groupSummaries.length)    hits.push(`Groups: ${groupSummaries.join(' · ')}`);
      if (topDetect.account)        hits.push(`Account: ${topDetect.account}`);
      if (topDetect.surface)        hits.push(`Surface: ${topDetect.surface}`);

      setOcrStatus(`✓ ${newRows.length} rows across ${Object.keys(groups).length} group(s). Review numbers — OCR can misread $ as S, 0 as O.`);
      if (hits.length) setDetectedNote(hits.join('  ·  '));
      setTimeout(() => setOcrStatus(null), 12000);
    } catch (e) {
      setOcrError(`OCR failed: ${e.message || e}`);
      setOcrStatus(null);
    } finally {
      setOcring(false);
    }
  };

  const recomputeDeltas = () => {
    setD(prev => ({
      ...prev,
      rows: prev.rows.map(r => {
        if (!r.platform || !r.tableau) return r;
        const { delta, deltaClass } = computeDelta(r.platform, r.tableau);
        return { ...r, delta: delta || r.delta, deltaClass: delta ? deltaClass : r.deltaClass };
      }),
    }));
  };

  const runAnalysis = async () => {
    if (d.evidence.length === 0) { setAiError('Add at least one screenshot first.'); return; }
    setAnalyzing(true); setAiError(null); setAiStatus('Sending images to Claude…'); setAiRaw(null); setOcrError(null);
    try {
      const images = d.evidence.map((ev) => ev.src);
      const parsed = await api.analyze(images);
      if (parsed._parseError) {
        setAiError(`Claude responded but the output was not valid JSON${parsed.stopReason ? ' (stop_reason: ' + parsed.stopReason + ')' : ''}.`);
        setAiRaw(parsed.rawResponse || '');
        setAiStatus(null);
        return;
      }

      // Option B: Claude returns per-brand groups → the code sums them.
      // Fallback: if Claude returned the old flat "rows" shape, use it directly.
      let rows, note;
      if (Array.isArray(parsed.groups) && parsed.groups.length) {
        rows = buildRowsFromGroups(parsed.groups);
        const combinedCount = parsed.groups.filter((g) => (g.platformBrands || []).length > 1).length;
        const totalBrands = parsed.groups.reduce((n, g) => n + (g.platformBrands || []).length, 0);
        note = `✓ ${rows.length} rows · ${parsed.groups.length} service group(s) · ${totalBrands} brand screenshots${combinedCount ? `, ${combinedCount} summed` : ''}. Review before saving.`;
      } else {
        rows = (parsed.rows || []).map((r) => ({ ...r, id: uid() }));
        note = `✓ Filled ${rows.length} rows. Review before saving.`;
      }

      const computedStatus = worstStatus(rows);
      setD((prev) => ({
        ...prev,
        account: parsed.account || prev.account,
        surface: parsed.surface || prev.surface,
        period: parsed.period || prev.period,
        platformLabel: parsed.platformLabel || prev.platformLabel,
        status: parsed.status || computedStatus || prev.status,
        statusLabel: parsed.statusLabel || prev.statusLabel,
        summary: parsed.summary || prev.summary,
        rows,
      }));
      setAiStatus(note);
      setTimeout(() => setAiStatus(null), 9000);
    } catch (e) {
      setAiError(`Analysis failed: ${e.message}`);
      setAiStatus(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!d.account.trim()) { alert('Account name is required'); return; }
    if (!d.surface.trim()) { alert('Surface is required'); return; }
    setSaving(true);
    try {
      const saved = await api.audits.save(d);
      onSave(saved); // parent handles vocabulary update
    } catch (e) {
      alert(`Save failed: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Modal title={audit ? 'Edit audit' : 'New audit'} onClose={onClose} maxWidth={980}>
      {/* ── OCR section ── */}
      <div style={{ background: T.tealSoft, border: `1px solid ${T.teal}`, borderRadius: 2, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <ScanText size={16} color={T.teal} strokeWidth={1.5} />
          <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.teal, textTransform: 'uppercase', letterSpacing: '0.14em' }}>OCR extraction · offline · learning</div>
        </div>
        <p style={{ color: T.textSec, fontSize: 13, lineHeight: 1.55, marginBottom: 14, marginTop: 0 }}>
          1. Drop screenshots below · 2. Tag each as <strong style={{ color: T.text }}>Tableau</strong> or <strong style={{ color: T.text }}>Platform</strong>, and set its <strong style={{ color: T.text }}>Group</strong> (e.g. "Amazon · Sponsored Products") · 3. Click Extract. <strong style={{ color: T.text }}>Multiple platform screenshots in the same group get summed</strong> (ratios like ROAS/ACOS/CPC are recomputed from the totals) and compared to that group's Tableau. Platform, account & surface auto-detect when possible.
        </p>
        <p style={{ color: T.textTer, fontSize: 11.5, lineHeight: 1.5, marginBottom: 14, marginTop: 0, fontFamily: T.fontMono }}>
          Tip: name files like <span style={{ color: T.teal }}>3M-SP-AMS-Nexcare</span> and the group auto-fills (SP→Sponsored Products, SB→Brands, SD→Display; AMS→Amazon).
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Btn icon={ocring ? Loader2 : ScanText} onClick={runOcr} variant="teal" disabled={ocring || d.evidence.length === 0}>
            {ocring ? 'Extracting…' : 'Extract with OCR'}
          </Btn>
          {ocrStatus && <span style={{ color: T.teal, fontSize: 12, fontFamily: T.fontMono }}>{ocrStatus}</span>}
          {ocrError && <span style={{ color: T.danger, fontSize: 12, fontFamily: T.fontMono, display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertCircle size={12} />{ocrError}</span>}
        </div>
        {detectedNote && (
          <div style={{ marginTop: 12, padding: 10, background: T.bgInput, border: `1px dashed ${T.teal}`, borderRadius: 2, color: T.teal, fontSize: 11.5, fontFamily: T.fontMono }}>
            🧠 Detected from vocabulary → {detectedNote}
          </div>
        )}
      </div>

      {/* ── Claude AI section (collapsible) ── */}
      <details style={{ marginBottom: 24 }}>
        <summary style={{ color: T.textTer, fontSize: 11, fontFamily: T.fontMono, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '8px 0' }}>
          ↓ Alternative: AI analysis with Claude (more accurate, consumes tokens)
        </summary>
        <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}`, borderRadius: 2, padding: 18, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Sparkles size={16} color={T.accent} strokeWidth={1.5} />
            <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Claude vision analysis</div>
          </div>
          <p style={{ color: T.textSec, fontSize: 13, lineHeight: 1.55, marginBottom: 14, marginTop: 0 }}>
            Sends screenshots to Claude for full audit auto-fill. Claude reads each brand separately and the app sums brands within each service (recomputing ROAS/ACOS/CPC from the totals) — so multi-brand advertisers like 3M aggregate exactly. ~$0.02-0.08 per run depending on image count.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Btn icon={analyzing ? Loader2 : Sparkles} onClick={runAnalysis} variant="accent" disabled={analyzing || d.evidence.length === 0}>
              {analyzing ? 'Analyzing…' : `Analyze ${d.evidence.length || 'screenshots'}`}
            </Btn>
            {aiStatus && <span style={{ color: T.success, fontSize: 12, fontFamily: T.fontMono }}>{aiStatus}</span>}
            {aiError && <span style={{ color: T.danger, fontSize: 12, fontFamily: T.fontMono, display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertCircle size={12} />{aiError}</span>}
          </div>
          {aiRaw && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ color: T.textTer, fontSize: 11, fontFamily: T.fontMono, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Show raw response from Claude ↓</summary>
              <pre style={{ marginTop: 10, padding: 12, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 2, color: T.textSec, fontSize: 11, fontFamily: T.fontMono, lineHeight: 1.5, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{aiRaw}</pre>
            </details>
          )}
        </div>
      </details>

      {/* ── Header fields with autocomplete ── */}
      <div style={{ marginBottom: 18 }}>
        <Label>Cliente / grupo</Label>
        <AutocompleteInput value={d.client} onChange={(v) => upd('client', v)} placeholder="Interamerican Foods Corporation" suggestions={clientSuggestions} />
        <div style={{ fontFamily: T.fontMono, fontSize: 10.5, color: T.textTer, marginTop: 6, lineHeight: 1.5 }}>
          Agrupa este audit bajo un cliente en la portada. Usa el mismo nombre exacto para juntar varias plataformas. Déjalo vacío y será su propio grupo.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <div><Label>Account</Label><AutocompleteInput value={d.account} onChange={(v) => upd('account', v)} placeholder="Bachoco" suggestions={vocabulary.account} /></div>
        <div><Label>Surface</Label><AutocompleteInput value={d.surface} onChange={(v) => upd('surface', v)} placeholder="Mercado Libre · Tableau" suggestions={vocabulary.surface} /></div>
        <div><Label>Period</Label><Input value={d.period} onChange={(v) => upd('period', v)} placeholder="Apr 1 – Apr 30, 2026" /></div>
        <div><Label>Platform label</Label><AutocompleteInput value={d.platformLabel} onChange={(v) => upd('platformLabel', v)} placeholder="MeLi platform" suggestions={vocabulary.platform_label} /></div>
        <div><Label>Status</Label><Select value={d.status} onChange={(v) => upd('status', v)} options={[{ value: 'clean', label: 'Clean ✓' }, { value: 'warn', label: 'Watch ⚠' }, { value: 'issue', label: 'Issue ✗' }]} style={{ width: '100%' }} /></div>
        <div><Label>Status label</Label><AutocompleteInput value={d.statusLabel} onChange={(v) => upd('statusLabel', v)} placeholder="BADS spend −54%" suggestions={vocabulary.status_label} /></div>
      </div>
      <div style={{ marginBottom: 26 }}><Label>Summary</Label><Input multiline value={d.summary} onChange={(v) => upd('summary', v)} placeholder="Narrative…" /></div>

      {/* ── Metric rows with autocomplete on Section + Metric ── */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 400 }}>Metric rows <span style={{ color: T.textTer, fontFamily: T.fontMono, fontSize: 11, marginLeft: 8 }}>({d.rows.length}) · drag ⠿ to reorder</span></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn icon={RefreshCw} onClick={recomputeDeltas} size="sm" disabled={d.rows.length === 0}>Recompute Δ</Btn>
            <Btn icon={Plus} onClick={addRow} size="sm">Add row</Btn>
          </div>
        </div>
        {d.rows.length === 0 && <div style={{ color: T.textTer, fontStyle: 'italic', fontSize: 13, padding: '14px 0' }}>No metrics yet — run OCR or AI above, or add rows manually.</div>}
        {d.rows.map((r, idx) => (
          <div
            key={r.id}
            onDragOver={(e) => { if (dragIdx !== null) e.preventDefault(); }}
            onDrop={() => { if (dragIdx !== null && dragIdx !== idx) moveRow(dragIdx, idx); setDragIdx(null); }}
            style={{ display: 'grid', gridTemplateColumns: 'auto 1.2fr 1.2fr 1.2fr 1.2fr 0.8fr 1.2fr auto', gap: 8, marginBottom: 8, alignItems: 'start', opacity: dragIdx === idx ? 0.35 : 1, transition: 'opacity 0.15s' }}
          >
            <div
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragEnd={() => setDragIdx(null)}
              title="Drag to reorder"
              style={{ cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textTer, paddingTop: 10, userSelect: 'none' }}
            >
              <GripVertical size={15} strokeWidth={1.5} />
            </div>
            <AutocompleteInput value={r.section} onChange={(v) => updRow(r.id, 'section', v)} placeholder="Section" mono suggestions={vocabulary.section} />
            <AutocompleteInput value={r.metric} onChange={(v) => updRow(r.id, 'metric', v)} placeholder="Metric" suggestions={vocabulary.metric} />
            <Input value={r.platform} onChange={(v) => updRow(r.id, 'platform', v)} placeholder="Platform" mono />
            <Input value={r.tableau} onChange={(v) => updRow(r.id, 'tableau', v)} placeholder="Tableau" mono />
            <Input value={r.delta} onChange={(v) => updRow(r.id, 'delta', v)} placeholder="Δ" mono />
            <Select value={r.deltaClass} onChange={(v) => updRow(r.id, 'deltaClass', v)} options={[{ value: 'good', label: '✓ good' }, { value: 'meh', label: '⚠ meh' }, { value: 'bad', label: '✗ bad' }]} />
            <button onClick={() => delRow(r.id)} style={{ background: 'transparent', border: 'none', color: T.textTer, cursor: 'pointer', padding: 6, marginTop: 8 }}><Trash2 size={14} strokeWidth={1.5} /></button>
          </div>
        ))}
      </div>

      {/* ── Evidence ── */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 400 }}>Evidence <span style={{ color: T.textTer, fontFamily: T.fontMono, fontSize: 11, marginLeft: 8 }}>({d.evidence.length})</span></div>
        </div>
        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }} style={{ border: `1px dashed ${T.borderLight}`, borderRadius: 4, padding: 24, textAlign: 'center', marginBottom: 14, color: T.textTer, fontSize: 13 }}>
          <Upload size={20} strokeWidth={1.5} style={{ marginBottom: 8, color: T.textSec }} />
          <div style={{ fontFamily: T.fontMono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>Drop screenshots here</div>
          <label style={{ color: T.textSec, cursor: 'pointer', fontSize: 12, textDecoration: 'underline', textDecorationColor: T.border, textUnderlineOffset: 4 }}>
            or click to select files
            <input type="file" multiple accept="image/*" onChange={(e) => handleFiles(e.target.files)} style={{ display: 'none' }} />
          </label>
        </div>
        {d.evidence.map((ev) => (
          <div key={ev.id} style={{ display: 'grid', gridTemplateColumns: '80px 150px 1fr auto', gap: 12, marginBottom: 12, padding: 10, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 2, alignItems: 'flex-start' }}>
            <img src={ev.src} alt="" style={{ width: 80, height: 60, objectFit: 'cover', border: `1px solid ${T.border}`, borderRadius: 2 }} />
            <div>
              <Select value={ev.type || ''} onChange={(v) => updEv(ev.id, 'type', v)} options={[{ value: '', label: '— Type —' }, { value: 'tableau', label: 'Tableau' }, { value: 'platform', label: 'Platform' }, { value: 'other', label: 'Other' }]} style={{ width: '100%', fontSize: 11, padding: '7px 8px' }} />
              <AutocompleteInput value={ev.group || ''} onChange={(v) => updEv(ev.id, 'group', v)} placeholder="Group / service" mono suggestions={vocabulary.section} style={{ marginTop: 6, fontSize: 11, padding: '7px 8px' }} />
              <Input value={ev.label} onChange={(v) => updEv(ev.id, 'label', v)} placeholder="Label" mono style={{ marginTop: 6, fontSize: 11 }} />
            </div>
            <Input multiline value={ev.caption} onChange={(v) => updEv(ev.id, 'caption', v)} placeholder="Caption (optional)…" style={{ minHeight: 60, fontSize: 12 }} />
            <button onClick={() => delEv(ev.id)} style={{ background: 'transparent', border: 'none', color: T.textTer, cursor: 'pointer', padding: 6 }}><Trash2 size={14} strokeWidth={1.5} /></button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <Btn onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn icon={saving ? Loader2 : Save} onClick={save} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save audit'}</Btn>
      </div>
    </Modal>
  );
}

function Investigations({ list, editMode, onEdit, onDelete, onAdd }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
        <h2 style={{ fontFamily: T.fontDisplay, fontWeight: 400, fontSize: 28, letterSpacing: '-0.015em', margin: 0 }}>Open <em style={{ fontStyle: 'italic', color: T.textSec }}>investigations</em></h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{list.length} open</span>
          <Btn icon={Plus} onClick={onAdd} size="sm">Add</Btn>
        </div>
      </div>
      <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, padding: '8px 32px', marginBottom: 72 }}>
        {list.length === 0 && <div style={{ padding: '22px 0', color: T.textTer, fontStyle: 'italic', fontSize: 13 }}>No open investigations.</div>}
        {list.map((i, idx) => {
          const c = i.severity === 'high' ? T.danger : T.warning;
          const sf = i.severity === 'high' ? T.dangerSoft : T.warningSoft;
          return (
            <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '200px 1fr auto auto', gap: 24, padding: '22px 0', borderBottom: idx < list.length - 1 ? `1px solid ${T.border}` : 'none', alignItems: 'start' }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 11.5, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.12em', paddingTop: 4 }}>{i.account}</div>
              <div>
                <strong style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 400, display: 'block', marginBottom: 6 }}>{i.title}</strong>
                <span style={{ color: T.textSec, fontSize: 13.5, lineHeight: 1.6 }}>{i.detail}</span>
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.14em', padding: '5px 11px', borderRadius: 2, background: sf, color: c, whiteSpace: 'nowrap', marginTop: 4 }}>{i.severity === 'high' ? 'High' : 'Medium'}</div>
              {editMode && <div style={{ display: 'flex', gap: 6, marginTop: 2 }}><Btn icon={Pencil} onClick={() => onEdit(i)} size="sm">Edit</Btn><Btn icon={Trash2} onClick={() => onDelete(i)} variant="danger" size="sm">Del</Btn></div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function InvestigationEditor({ investigation, onSave, onClose }) {
  const [d, setD] = useState(investigation || blank.inv());
  const [saving, setSaving] = useState(false);
  const upd = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!d.title.trim()) return alert('Title required');
    setSaving(true);
    try { const saved = await api.investigations.save(d); onSave(saved); }
    catch (e) { alert(`Save failed: ${e.message}`); setSaving(false); }
  };
  return (
    <Modal title={investigation ? 'Edit investigation' : 'New investigation'} onClose={onClose} maxWidth={720}>
      <div style={{ marginBottom: 16 }}><Label>Account / Surface</Label><Input value={d.account} onChange={(v) => upd('account', v)} /></div>
      <div style={{ marginBottom: 16 }}><Label>Title</Label><Input value={d.title} onChange={(v) => upd('title', v)} /></div>
      <div style={{ marginBottom: 16 }}><Label>Detail</Label><Input multiline value={d.detail} onChange={(v) => upd('detail', v)} /></div>
      <div style={{ marginBottom: 24 }}><Label>Severity</Label><Select value={d.severity} onChange={(v) => upd('severity', v)} options={[{ value: 'high', label: 'High' }, { value: 'med', label: 'Medium' }]} /></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <Btn onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn icon={saving ? Loader2 : Save} onClick={save} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
      </div>
    </Modal>
  );
}

function MetaEditor({ meta, onSave, onClose }) {
  const [d, setD] = useState(meta);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { const saved = await api.meta.update(d); onSave(saved); }
    catch (e) { alert(`Save failed: ${e.message}`); setSaving(false); }
  };
  return (
    <Modal title="Edit header" onClose={onClose} maxWidth={680}>
      <div style={{ marginBottom: 16 }}><Label>Title</Label><Input value={d.title} onChange={(v) => setD((p) => ({ ...p, title: v }))} /></div>
      <div style={{ marginBottom: 16 }}><Label>Subtitle</Label><Input multiline value={d.subtitle} onChange={(v) => setD((p) => ({ ...p, subtitle: v }))} /></div>
      <div style={{ marginBottom: 24 }}><Label>Period</Label><Input value={d.period} onChange={(v) => setD((p) => ({ ...p, period: v }))} /></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <Btn onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn icon={saving ? Loader2 : Save} onClick={save} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
      </div>
    </Modal>
  );
}

// Extract terms from a saved audit for vocabulary learning
function extractLearnings(audit) {
  const out = [];
  if (audit.account)       out.push({ category: 'account',        term: audit.account.trim() });
  if (audit.surface)       out.push({ category: 'surface',        term: audit.surface.trim() });
  if (audit.platformLabel && audit.platformLabel !== 'Platform') out.push({ category: 'platform_label', term: audit.platformLabel.trim() });
  if (audit.statusLabel)   out.push({ category: 'status_label',   term: audit.statusLabel.trim() });
  for (const r of (audit.rows || [])) {
    if (r.section) out.push({ category: 'section', term: r.section.trim() });
    if (r.metric)  out.push({ category: 'metric',  term: r.metric.trim() });
  }
  return out.filter(l => l.term);
}

export default function App() {
  const [meta, setMeta] = useState({ title: 'Tableau Reconciliation', subtitle: '', period: '' });
  const [audits, setAudits] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [vocabulary, setVocabulary] = useState(EMPTY_VOCAB);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingAudit, setEditingAudit] = useState(null);
  const [viewingEvidence, setViewingEvidence] = useState(null);
  const [editingInv, setEditingInv] = useState(null);
  const [editingMeta, setEditingMeta] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [m, a, i, v] = await Promise.all([
          api.meta.get(),
          api.audits.list(),
          api.investigations.list(),
          api.vocabulary.get().catch(() => EMPTY_VOCAB), // graceful if table doesn't exist yet
        ]);
        setMeta(m); setAudits(a); setInvestigations(i); setVocabulary({ ...EMPTY_VOCAB, ...v });
      } catch (e) {
        setLoadError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => ({
    total: audits.length,
    clean: audits.filter((a) => a.status === 'clean').length,
    warn:  audits.filter((a) => a.status === 'warn').length,
    issue: audits.filter((a) => a.status === 'issue').length,
  }), [audits]);

  // Group audits by client. Uses the explicit `client` field; falls back to
  // `account` when a client hasn't been assigned, so old audits still appear.
  const groupedAudits = useMemo(() => {
    const g = {};
    for (const a of audits) {
      const key = (((a.client || '').trim()) || ((a.account || '').trim())) || 'Sin nombre';
      (g[key] = g[key] || []).push(a);
    }
    return Object.keys(g).sort((x, y) => x.localeCompare(y)).map((k) => ({ account: k, items: g[k] }));
  }, [audits]);

  // Existing client/account names, for the autocomplete in the editor.
  const clientSuggestions = useMemo(() => {
    const set = new Set();
    for (const a of audits) {
      const c = ((a.client || '').trim()) || ((a.account || '').trim());
      if (c) set.add(c);
    }
    return [...set].sort((x, y) => x.localeCompare(y));
  }, [audits]);

  // Collapse state. null = auto (clients with problems open, clean ones closed).
  const [openAccounts, setOpenAccounts] = useState(null);
  const groupHasProblems = (items) => items.some((a) => a.status === 'warn' || a.status === 'issue');
  const isAccountOpen = (account, items) => (openAccounts === null ? groupHasProblems(items) : openAccounts.has(account));
  const toggleAccount = (account) => {
    setOpenAccounts((prev) => {
      const base = prev === null
        ? new Set(groupedAudits.filter((g) => groupHasProblems(g.items)).map((g) => g.account))
        : new Set(prev);
      if (base.has(account)) base.delete(account); else base.add(account);
      return base;
    });
  };
  const expandAllAccounts = () => setOpenAccounts(new Set(groupedAudits.map((g) => g.account)));
  const collapseAllAccounts = () => setOpenAccounts(new Set());

  const handleSavedAudit = async (saved) => {
    setAudits((p) => p.find((x) => x.id === saved.id) ? p.map((x) => (x.id === saved.id ? saved : x)) : [...p, saved]);
    setEditingAudit(null);
    // Capture vocabulary from this audit (async, non-blocking)
    const learnings = extractLearnings(saved);
    if (learnings.length) {
      try {
        const updated = await api.vocabulary.save(learnings);
        setVocabulary({ ...EMPTY_VOCAB, ...updated });
      } catch (e) {
        console.warn('Vocabulary update failed:', e.message);
      }
    }
  };
  const delAudit = async (a) => {
    if (!window.confirm(`Delete ${a.account} · ${a.surface}?`)) return;
    try { await api.audits.delete(a.id); setAudits((p) => p.filter((x) => x.id !== a.id)); }
    catch (e) { alert(`Delete failed: ${e.message}`); }
  };
  const handleSavedInv = (saved) => {
    setInvestigations((p) => p.find((x) => x.id === saved.id) ? p.map((x) => (x.id === saved.id ? saved : x)) : [...p, saved]);
    setEditingInv(null);
  };
  const delInv = async (i) => {
    if (!window.confirm('Delete?')) return;
    try { await api.investigations.delete(i.id); setInvestigations((p) => p.filter((x) => x.id !== i.id)); }
    catch (e) { alert(`Delete failed: ${e.message}`); }
  };
  const handleSavedMeta = (saved) => { setMeta(saved); setEditingMeta(false); };

  if (loading) return <div style={{ background: T.bg, color: T.textTer, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fontMono, fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase' }}><Database size={14} style={{ marginRight: 10 }} /> Loading…</div>;

  if (loadError) return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh', padding: 40, fontFamily: T.fontBody }}>
      <div style={{ maxWidth: 600, margin: '60px auto', background: T.bgCard, border: `1px solid ${T.danger}`, padding: 32, borderRadius: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <AlertCircle size={18} color={T.danger} />
          <h2 style={{ margin: 0, fontFamily: T.fontDisplay, fontWeight: 400, fontSize: 22 }}>Couldn't load data</h2>
        </div>
        <p style={{ color: T.textSec, fontSize: 14, lineHeight: 1.65 }}>{loadError}</p>
        <p style={{ color: T.textTer, fontSize: 13, lineHeight: 1.6 }}>Likely cause: env vars missing in Vercel. Check that <code style={{ fontFamily: T.fontMono, color: T.text }}>SUPABASE_URL</code> and <code style={{ fontFamily: T.fontMono, color: T.text }}>SUPABASE_SERVICE_ROLE_KEY</code> are set. After updating env vars, redeploy.</p>
      </div>
    </div>
  );

  return (
    <div style={{ color: T.text, fontFamily: T.fontBody }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 32px 96px' }}>
        <Header meta={meta} onAdd={() => setEditingAudit('new')} editMode={editMode} setEditMode={setEditMode} onEditMeta={() => setEditingMeta(true)} />
        <Summary stats={stats} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
          <h2 style={{ fontFamily: T.fontDisplay, fontWeight: 400, fontSize: 28, letterSpacing: '-0.015em', margin: 0 }}>Account <em style={{ fontStyle: 'italic', color: T.textSec }}>audits</em></h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {groupedAudits.length > 1 && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={expandAllAccounts} style={{ background: 'none', border: 'none', color: T.textTer, fontFamily: T.fontMono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', cursor: 'pointer', padding: 0 }}>Expand all</button>
                <span style={{ color: T.border }}>·</span>
                <button onClick={collapseAllAccounts} style={{ background: 'none', border: 'none', color: T.textTer, fontFamily: T.fontMono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', cursor: 'pointer', padding: 0 }}>Collapse all</button>
              </div>
            )}
            <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
              {groupedAudits.length} client{groupedAudits.length !== 1 ? 's' : ''} · {audits.length} audit{audits.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div style={{ marginBottom: 72 }}>
          {audits.length === 0 && <div style={{ background: T.bgCard, border: `1px dashed ${T.borderLight}`, padding: 56, textAlign: 'center', color: T.textTer, fontSize: 13 }}>No audits yet. Click <strong style={{ color: T.text }}>Add audit</strong> to start.</div>}
          {groupedAudits.map((g) => (
            <AccountGroup
              key={g.account}
              account={g.account}
              items={g.items}
              expanded={isAccountOpen(g.account, g.items)}
              onToggle={() => toggleAccount(g.account)}
              editMode={editMode}
              onEdit={(a) => setEditingAudit(a.id)}
              onDelete={delAudit}
              onViewEvidence={setViewingEvidence}
            />
          ))}
        </div>
        <Investigations list={investigations} editMode={editMode} onAdd={() => setEditingInv('new')} onEdit={(i) => setEditingInv(i.id)} onDelete={delInv} />
        <footer style={{ paddingTop: 32, borderTop: `1px solid ${T.border}`, color: T.textTer, fontSize: 11.5, fontFamily: T.fontMono, textAlign: 'center', letterSpacing: '0.08em' }}>
          Reconciliation app · multi-user · OCR with learning vocabulary
        </footer>
      </div>
      {editingAudit && <AuditEditor audit={editingAudit === 'new' ? null : audits.find((a) => a.id === editingAudit)} defaultPeriod={meta.period} vocabulary={vocabulary} clientSuggestions={clientSuggestions} onSave={handleSavedAudit} onClose={() => setEditingAudit(null)} />}
      {viewingEvidence && <EvidenceModal audit={viewingEvidence} onClose={() => setViewingEvidence(null)} />}
      {editingInv && <InvestigationEditor investigation={editingInv === 'new' ? null : investigations.find((i) => i.id === editingInv)} onSave={handleSavedInv} onClose={() => setEditingInv(null)} />}
      {editingMeta && <MetaEditor meta={meta} onSave={handleSavedMeta} onClose={() => setEditingMeta(false)} />}
    </div>
  );
}
