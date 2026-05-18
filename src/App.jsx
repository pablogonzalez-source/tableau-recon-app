import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Image as ImageIcon, Save, Upload, Eye, Database, Sparkles, Loader2, AlertCircle } from 'lucide-react';
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

// ─── HELPERS ───
const uid = () => 'id_' + Math.random().toString(36).slice(2, 10);
const blank = {
  audit: (period) => ({ id: uid(), account: '', surface: '', period: period || '', status: 'clean', statusLabel: '', summary: '', platformLabel: 'Platform', rows: [], evidence: [] }),
  row:   () => ({ id: uid(), section: '', metric: '', platform: '', tableau: '', delta: '', deltaClass: 'good', note: '' }),
  inv:   () => ({ id: uid(), account: '', title: '', detail: '', severity: 'med' }),
};
const fileToDataUri = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

// ─── UI PRIMITIVES ───
function Btn({ children, onClick, variant = 'default', icon: Icon, size = 'md', style = {}, disabled, ...rest }) {
  const sizes = { sm: { padding: '6px 11px', fontSize: 10.5, gap: 6 }, md: { padding: '9px 16px', fontSize: 11, gap: 8 } };
  const variants = {
    default: { background: 'transparent', border: `1px solid ${T.borderLight}`, color: T.textSec },
    primary: { background: T.success, border: `1px solid ${T.success}`, color: '#0a0e1a' },
    accent:  { background: T.accent, border: `1px solid ${T.accent}`, color: '#0a0e1a' },
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

function Header({ meta, onAdd, editMode, setEditMode, onEditMeta, saving }) {
  const words = (meta.title || 'Tableau Reconciliation').split(' ');
  return (
    <header style={{ marginBottom: 56, paddingBottom: 32, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textTer, letterSpacing: '0.22em', textTransform: 'uppercase' }}>Reconciliation App · multi-user</div>
        {saving && <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.warning, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 size={11} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</div>}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
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

function AuditCard({ audit, editMode, onEdit, onDelete, onViewEvidence }) {
  const s = STATUS[audit.status] || STATUS.clean;
  return (
    <article style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: `3px solid ${s.color}`, padding: '30px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 30, fontWeight: 400, letterSpacing: '-0.015em' }}>{audit.account}</div>
          <div style={{ fontFamily: T.fontMono, fontSize: 10.5, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.15em', padding: '5px 11px', border: `1px solid ${T.borderLight}`, borderRadius: 2 }}>{audit.surface}</div>
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

function EvidenceModal({ audit, onClose }) {
  return (
    <Modal title={<>Evidence · <em style={{ fontStyle: 'italic', color: T.textSec }}>{audit.account} · {audit.surface}</em></>} onClose={onClose} maxWidth={1080}>
      {(!audit.evidence || audit.evidence.length === 0) && <div style={{ color: T.textTer, fontStyle: 'italic' }}>No evidence attached.</div>}
      {(audit.evidence || []).map((ev, i, arr) => (
        <div key={ev.id} style={{ marginBottom: 36, paddingBottom: 36, borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none' }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>{ev.label}</div>
          <div style={{ color: T.textSec, fontSize: 13.5, lineHeight: 1.6, marginBottom: 16, maxWidth: '75ch' }}>{ev.caption}</div>
          <img src={ev.src} alt={ev.label} style={{ maxWidth: '100%', height: 'auto', border: `1px solid ${T.border}`, borderRadius: 2, display: 'block' }} />
        </div>
      ))}
    </Modal>
  );
}

function AuditEditor({ audit, defaultPeriod, onSave, onClose }) {
  const [d, setD] = useState(audit || blank.audit(defaultPeriod));
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const upd = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const updRow = (id, k, v) => setD((p) => ({ ...p, rows: p.rows.map((r) => (r.id === id ? { ...r, [k]: v } : r)) }));
  const addRow = () => setD((p) => ({ ...p, rows: [...p.rows, blank.row()] }));
  const delRow = (id) => setD((p) => ({ ...p, rows: p.rows.filter((r) => r.id !== id) }));
  const updEv = (id, k, v) => setD((p) => ({ ...p, evidence: p.evidence.map((e) => (e.id === id ? { ...e, [k]: v } : e)) }));
  const delEv = (id) => setD((p) => ({ ...p, evidence: p.evidence.filter((e) => e.id !== id) }));

  const handleFiles = async (files) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const newEv = [];
    for (const f of list) {
      const src = await fileToDataUri(f);
      newEv.push({ id: uid(), src, label: f.name.replace(/\.[^/.]+$/, ''), caption: '' });
    }
    setD((p) => ({ ...p, evidence: [...p.evidence, ...newEv] }));
  };

  const runAnalysis = async () => {
    if (d.evidence.length === 0) { setAiError('Add at least one screenshot first.'); return; }
    setAnalyzing(true); setAiError(null); setAiStatus('Sending images to Claude…');
    try {
      const images = d.evidence.map((ev) => ev.src);
      const parsed = await api.analyze(images);
      if (parsed._parseError) {
        setAiError('Claude responded but the output was not valid JSON. See console.');
        console.warn('Raw response:', parsed.rawResponse);
        return;
      }
      setD((prev) => ({
        ...prev,
        account: parsed.account || prev.account,
        surface: parsed.surface || prev.surface,
        period: parsed.period || prev.period,
        platformLabel: parsed.platformLabel || prev.platformLabel,
        status: parsed.status || prev.status,
        statusLabel: parsed.statusLabel || prev.statusLabel,
        summary: parsed.summary || prev.summary,
        rows: (parsed.rows || []).map((r) => ({ ...r, id: uid() })),
      }));
      setAiStatus(`✓ Filled ${parsed.rows?.length || 0} rows. Review before saving.`);
      setTimeout(() => setAiStatus(null), 6000);
    } catch (e) {
      setAiError(`Analysis failed: ${e.message}`);
    }
    setAnalyzing(false);
  };

  const save = async () => {
    if (!d.account.trim()) { alert('Account name is required'); return; }
    if (!d.surface.trim()) { alert('Surface is required'); return; }
    setSaving(true);
    try {
      const saved = await api.audits.save(d);
      onSave(saved);
    } catch (e) {
      alert(`Save failed: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Modal title={audit ? 'Edit audit' : 'New audit'} onClose={onClose} maxWidth={980}>
      <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}`, borderRadius: 2, padding: 18, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Sparkles size={16} color={T.accent} strokeWidth={1.5} />
          <div style={{ fontFamily: T.fontMono, fontSize: 11, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.14em' }}>AI screenshot analysis</div>
        </div>
        <p style={{ color: T.textSec, fontSize: 13, lineHeight: 1.55, marginBottom: 14, marginTop: 0 }}>
          Drop your Tableau and platform screenshots in the Evidence section below, then click Analyze. Claude identifies each image, extracts the metrics, computes deltas, and fills the form for you to review.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Btn icon={analyzing ? Loader2 : Sparkles} onClick={runAnalysis} variant="accent" disabled={analyzing || d.evidence.length === 0}>
            {analyzing ? 'Analyzing…' : `Analyze ${d.evidence.length || 'screenshots'}`}
          </Btn>
          {aiStatus && <span style={{ color: T.success, fontSize: 12, fontFamily: T.fontMono }}>{aiStatus}</span>}
          {aiError && <span style={{ color: T.danger, fontSize: 12, fontFamily: T.fontMono, display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertCircle size={12} />{aiError}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <div><Label>Account</Label><Input value={d.account} onChange={(v) => upd('account', v)} placeholder="Bachoco" /></div>
        <div><Label>Surface</Label><Input value={d.surface} onChange={(v) => upd('surface', v)} placeholder="Mercado Libre · Tableau" /></div>
        <div><Label>Period</Label><Input value={d.period} onChange={(v) => upd('period', v)} placeholder="Apr 1 – Apr 30, 2026" /></div>
        <div><Label>Platform label</Label><Input value={d.platformLabel} onChange={(v) => upd('platformLabel', v)} placeholder="MeLi platform" /></div>
        <div><Label>Status</Label><Select value={d.status} onChange={(v) => upd('status', v)} options={[{ value: 'clean', label: 'Clean ✓' }, { value: 'warn', label: 'Watch ⚠' }, { value: 'issue', label: 'Issue ✗' }]} style={{ width: '100%' }} /></div>
        <div><Label>Status label</Label><Input value={d.statusLabel} onChange={(v) => upd('statusLabel', v)} placeholder="BADS spend −54%" /></div>
      </div>
      <div style={{ marginBottom: 26 }}><Label>Summary</Label><Input multiline value={d.summary} onChange={(v) => upd('summary', v)} placeholder="Narrative…" /></div>

      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 18, fontWeight: 400 }}>Metric rows <span style={{ color: T.textTer, fontFamily: T.fontMono, fontSize: 11, marginLeft: 8 }}>({d.rows.length})</span></div>
          <Btn icon={Plus} onClick={addRow} size="sm">Add row</Btn>
        </div>
        {d.rows.length === 0 && <div style={{ color: T.textTer, fontStyle: 'italic', fontSize: 13, padding: '14px 0' }}>No metrics yet — analyze screenshots above, or add rows manually.</div>}
        {d.rows.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.2fr 1.2fr 0.8fr 1.2fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <Input value={r.section} onChange={(v) => updRow(r.id, 'section', v)} placeholder="Section" mono />
            <Input value={r.metric} onChange={(v) => updRow(r.id, 'metric', v)} placeholder="Metric" />
            <Input value={r.platform} onChange={(v) => updRow(r.id, 'platform', v)} placeholder="Platform" mono />
            <Input value={r.tableau} onChange={(v) => updRow(r.id, 'tableau', v)} placeholder="Tableau" mono />
            <Input value={r.delta} onChange={(v) => updRow(r.id, 'delta', v)} placeholder="Δ" mono />
            <Select value={r.deltaClass} onChange={(v) => updRow(r.id, 'deltaClass', v)} options={[{ value: 'good', label: '✓ good' }, { value: 'meh', label: '⚠ meh' }, { value: 'bad', label: '✗ bad' }]} />
            <button onClick={() => delRow(r.id)} style={{ background: 'transparent', border: 'none', color: T.textTer, cursor: 'pointer', padding: 6 }}><Trash2 size={14} strokeWidth={1.5} /></button>
          </div>
        ))}
      </div>

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
          <div key={ev.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 14, marginBottom: 12, padding: 10, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 2, alignItems: 'flex-start' }}>
            <img src={ev.src} alt="" style={{ width: 80, height: 60, objectFit: 'cover', border: `1px solid ${T.border}`, borderRadius: 2 }} />
            <div>
              <Input value={ev.label} onChange={(v) => updEv(ev.id, 'label', v)} placeholder="Label" mono style={{ marginBottom: 6, fontSize: 11.5 }} />
              <Input multiline value={ev.caption} onChange={(v) => updEv(ev.id, 'caption', v)} placeholder="Caption…" style={{ minHeight: 50, fontSize: 12 }} />
            </div>
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

export default function App() {
  const [meta, setMeta] = useState({ title: 'Tableau Reconciliation', subtitle: '', period: '' });
  const [audits, setAudits] = useState([]);
  const [investigations, setInvestigations] = useState([]);
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
        const [m, a, i] = await Promise.all([api.meta.get(), api.audits.list(), api.investigations.list()]);
        setMeta(m); setAudits(a); setInvestigations(i);
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

  const handleSavedAudit = (saved) => {
    setAudits((p) => p.find((x) => x.id === saved.id) ? p.map((x) => (x.id === saved.id ? saved : x)) : [...p, saved]);
    setEditingAudit(null);
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
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textTer, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{audits.length} audit{audits.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 72 }}>
          {audits.length === 0 && <div style={{ background: T.bgCard, border: `1px dashed ${T.borderLight}`, padding: 56, textAlign: 'center', color: T.textTer, fontSize: 13 }}>No audits yet. Click <strong style={{ color: T.text }}>Add audit</strong> to start.</div>}
          {audits.map((a) => <AuditCard key={a.id} audit={a} editMode={editMode} onEdit={(a) => setEditingAudit(a.id)} onDelete={delAudit} onViewEvidence={setViewingEvidence} />)}
        </div>
        <Investigations list={investigations} editMode={editMode} onAdd={() => setEditingInv('new')} onEdit={(i) => setEditingInv(i.id)} onDelete={delInv} />
        <footer style={{ paddingTop: 32, borderTop: `1px solid ${T.border}`, color: T.textTer, fontSize: 11.5, fontFamily: T.fontMono, textAlign: 'center', letterSpacing: '0.08em' }}>
          Reconciliation app · multi-user · AI-powered analysis
        </footer>
      </div>
      {editingAudit && <AuditEditor audit={editingAudit === 'new' ? null : audits.find((a) => a.id === editingAudit)} defaultPeriod={meta.period} onSave={handleSavedAudit} onClose={() => setEditingAudit(null)} />}
      {viewingEvidence && <EvidenceModal audit={viewingEvidence} onClose={() => setViewingEvidence(null)} />}
      {editingInv && <InvestigationEditor investigation={editingInv === 'new' ? null : investigations.find((i) => i.id === editingInv)} onSave={handleSavedInv} onClose={() => setEditingInv(null)} />}
      {editingMeta && <MetaEditor meta={meta} onSave={handleSavedMeta} onClose={() => setEditingMeta(false)} />}
    </div>
  );
}
