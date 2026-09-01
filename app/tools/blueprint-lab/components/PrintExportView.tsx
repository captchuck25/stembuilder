'use client';

// Print/Export tab — the printable architectural portfolio.
//
// A form for the title-block fields (student / school / project / date), a
// sheet checklist showing exactly which pages the PDF will contain (numbered
// the same way the builder numbers them), and the Export button. The PDF
// itself is assembled in engine/portfolio.ts from the same generators the
// Sandbox sheet uses. Assignment deliverables preset the optional sheets:
// floor-plan-only briefs (studio/condo) start with elevations/section/roof
// unchecked — still checkable, since the views always exist.

import { useMemo, useState } from 'react';
import { Project } from '../engine/types';
import { gatherRaw } from '../engine/sheet';
import {
  PortfolioInclude, buildPortfolioPdf, portfolioPages,
} from '../engine/portfolio';
import { T } from '../engine/theme';

interface PrintExportViewProps {
  project: Project;
  studentName: string;
  // Assignment deliverables when working in an assignment; null in free play.
  deliverables: Array<'floor-plan' | 'roof-plan' | 'elevations'> | null;
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'portfolio';
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: T.bg, border: `1px solid ${T.line}`, borderRadius: 6,
  color: T.ink, fontSize: 13, padding: '7px 10px', fontFamily: 'inherit',
  outline: 'none',
};

export default function PrintExportView({ project, studentName, deliverables }: PrintExportViewProps) {
  const [student, setStudent] = useState(studentName);
  const [school, setSchool] = useState('');
  const [projTitle, setProjTitle] = useState(project.name || '');
  const [date, setDate] = useState(todayLabel);
  const fullPipeline = !deliverables || deliverables.includes('elevations') || deliverables.includes('roof-plan');
  const [incElev, setIncElev] = useState(!deliverables || deliverables.includes('elevations'));
  const [incSect, setIncSect] = useState(fullPipeline);
  const [incRoof, setIncRoof] = useState(!deliverables || deliverables.includes('roof-plan'));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // What the project can actually produce. gatherRaw builds every view's
  // primitives — fine on demand for this tab, and the SAME source the export
  // will draw from, so the checklist can't disagree with the PDF.
  const raw = useMemo(() => gatherRaw(project), [project]);
  const hasFloor = raw.floorPlans.length > 0;
  const hasElev = raw.elevations.length > 0;
  const hasSect = raw.sections.length > 0;
  const hasRoof = raw.roof != null;

  const include: PortfolioInclude = {
    elevations: incElev && hasElev,
    sections: incSect && hasSect,
    roof: incRoof && hasRoof,
  };
  const pages = useMemo(() => portfolioPages(raw, include), [raw, include.elevations, include.sections, include.roof]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    if (busy || !hasFloor) return;
    setBusy(true);
    setNotice(null);
    try {
      const blob = await buildPortfolioPdf(project, { student, school, project: projTitle, date }, include);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(projTitle || project.name)} — portfolio.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setNotice('Portfolio PDF downloaded.');
    } catch {
      setNotice('Export failed — try again.');
    } finally {
      setBusy(false);
    }
  };

  const checkRow = (
    label: string, checked: boolean, onChange: (v: boolean) => void,
    available: boolean, hint: string,
  ) => (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '6px 2px',
      cursor: available ? 'pointer' : 'default', opacity: available ? 1 : 0.55,
      fontSize: 13, color: T.ink,
    }}>
      <input
        type="checkbox"
        checked={checked && available}
        disabled={!available}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: T.accent, width: 15, height: 15 }}
      />
      <span style={{ fontWeight: 500 }}>{label}</span>
      {!available && <span style={{ fontSize: 11.5, color: T.inkMuted }}>{hint}</span>}
    </label>
  );

  return (
    <div style={{
      flex: 1, overflowY: 'auto', background: T.bg,
      display: 'flex', justifyContent: 'center', padding: '36px 24px',
    }}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap', maxWidth: 900 }}>

        {/* ── Left: fields + options + export ── */}
        <div style={{
          width: 400, background: T.panel, border: `1px solid ${T.line}`,
          borderRadius: 10, padding: '26px 28px', boxShadow: T.shadow,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.8px',
            color: T.accent, textTransform: 'uppercase', marginBottom: 6,
          }}>Print / Export</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: T.ink, margin: '0 0 8px' }}>
            Architectural portfolio
          </h2>
          <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55, margin: '0 0 18px' }}>
            A multi-page PDF on legal 8.5×14 paper — every sheet gets a classic
            title-block border, and drawings plot at a real architect&apos;s scale
            (noted on each sheet).
          </p>

          {([
            ['Designed by', student, setStudent, 'Your name as it should appear on every sheet'],
            ['School', school, setSchool, 'School name'],
            ['Project title', projTitle, setProjTitle, 'e.g. Single-story home'],
            ['Date', date, setDate, ''],
          ] as [string, string, (v: string) => void, string][]).map(([label, val, set, ph]) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, color: T.inkSoft,
                textTransform: 'uppercase', marginBottom: 4,
              }}>{label}</div>
              <input
                value={val}
                placeholder={ph}
                onChange={e => set(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = T.accent; }}
                onBlur={e => { e.currentTarget.style.borderColor = T.line; }}
              />
            </div>
          ))}

          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, color: T.inkSoft,
            textTransform: 'uppercase', margin: '16px 0 4px',
          }}>Optional sheets</div>
          {checkRow('Elevations', incElev, setIncElev, hasElev, 'Draw walls first')}
          {checkRow('Cross sections', incSect, setIncSect, hasSect, 'Place a section cut in the 2D plan first')}
          {checkRow('Roof plan', incRoof, setIncRoof, hasRoof, 'Draw walls first')}

          <button
            onClick={handleExport}
            disabled={busy || !hasFloor}
            style={{
              width: '100%', marginTop: 18, padding: '10px 0', borderRadius: 8,
              border: 'none', cursor: busy || !hasFloor ? 'default' : 'pointer',
              background: busy || !hasFloor ? T.lineStrong : T.accent,
              color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            {busy ? 'Building PDF…' : 'Export portfolio PDF'}
          </button>
          {!hasFloor && (
            <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 8, textAlign: 'center' }}>
              Draw a floor plan first — the portfolio needs at least one floor.
            </div>
          )}
          {notice && (
            <div style={{
              marginTop: 10, textAlign: 'center', fontSize: 12.5, fontWeight: 600,
              color: notice.startsWith('Export failed') ? T.danger : T.good,
            }}>{notice}</div>
          )}
        </div>

        {/* ── Right: sheet list preview ── */}
        <div style={{
          width: 300, background: T.panel, border: `1px solid ${T.line}`,
          borderRadius: 10, padding: '22px 24px', boxShadow: T.shadow,
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, color: T.inkSoft,
            textTransform: 'uppercase', marginBottom: 10,
          }}>Sheets in this portfolio</div>
          <div style={{ display: 'flex', gap: 10, padding: '5px 0', fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: T.ink, width: 34 }}>A-0</span>
            <span style={{ color: T.inkSoft }}>Cover &amp; drawing index</span>
          </div>
          {pages.map(p => (
            <div key={p.no} style={{ display: 'flex', gap: 10, padding: '5px 0', fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: T.ink, width: 34 }}>{p.no}</span>
              <span style={{ color: T.inkSoft }}>{p.title}</span>
            </div>
          ))}
          {!hasFloor && (
            <div style={{ fontSize: 12.5, color: T.inkMuted, marginTop: 6 }}>
              Nothing to print yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
