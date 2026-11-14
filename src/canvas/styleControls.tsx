/**
 * Visual controls for styles: color swatches with a custom color, widths, dash patterns, text
 * styles, class chips, and the line and marker pickers of edges. They read and write the
 * declarations of `style`, `linkStyle` and `classDef` (see `withDeclaration` in styling.ts).
 */
import { useState, type JSX } from 'react';
import type { EdgeEnd, FlowModel, Stroke } from '../core/model';
import { declarationValue, withDeclaration } from '../flowchart/styling';

/** Fills: light tints that keep dark text readable. */
export const FILL_COLORS = ['#ffffff', '#ececff', '#dbeafe', '#dcfce7', '#fef9c3', '#ffedd5', '#fee2e2', '#f3e8ff', '#e5e7eb', '#1f2937'];
/** Lines, borders and text: strong colors. */
export const LINE_COLORS = ['#333333', '#9370db', '#2563eb', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#9333ea', '#6b7280', '#ffffff'];

/** A color in a form `<input type="color">` accepts (#rrggbb), or null. */
function hex6(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`;
  return null;
}

/**
 * A color: a row of swatches, a custom color, and the value as text (any CSS color). Empty means
 * "not set" (the theme's color).
 */
export function ColorField({ label, value, palette, onChange }: { label: string; value: string; palette: readonly string[]; onChange: (value: string) => void }): JSX.Element {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  const current = hex6(value);
  return (
    <div className="color-field" role="group" aria-label={label}>
      <span className="color-field-label">{label}</span>
      <div className="color-swatches">
        <button
          type="button"
          className={`color-swatch none${value === '' ? ' selected' : ''}`}
          title="Not set: the theme's color"
          aria-label={`${label}: not set`}
          aria-pressed={value === ''}
          onClick={() => onChange('')}
        />
        {palette.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-swatch${current === c ? ' selected' : ''}`}
            style={{ background: c }}
            title={c}
            aria-label={`${label}: ${c}`}
            aria-pressed={current === c}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <div className="color-field-row">
        <label className="color-custom" title="Pick any color">
          <input type="color" value={current ?? '#ffffff'} aria-label={`${label}: custom color`} onChange={(e) => onChange(e.target.value)} />
        </label>
        <input
        className="color-text mono"
        value={draft}
        placeholder="not set"
        spellCheck={false}
        aria-label={`${label} as text`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onChange(draft.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft !== value) onChange(draft.trim());
          if (e.key === 'Escape') setDraft(value);
        }}
      />
      </div>
    </div>
  );
}

/** A row of mutually exclusive buttons. */
export function Segmented<T extends string>({ label, value, options, onChange, title }: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: JSX.Element | string; title: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  title?: string;
}): JSX.Element {
  return (
    <div className="segmented-field" title={title}>
      <span className="color-field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'selected' : undefined}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const WIDTHS = ['', '1px', '2px', '3px', '4px'];
const DASHES: ReadonlyArray<{ value: string; title: string }> = [
  { value: '', title: 'Solid (or the theme default)' },
  { value: '5 5', title: 'Dashed (stroke-dasharray: 5 5)' },
  { value: '2 4', title: 'Dotted (stroke-dasharray: 2 4)' },
];

/** A small sample line for the width and dash pickers. */
function LineSample({ width, dash }: { width: string; dash?: string }): JSX.Element {
  return (
    <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
      <line x1="2" y1="6" x2="24" y2="6" stroke="currentColor" strokeWidth={parseFloat(width) || 1.5} strokeDasharray={dash || undefined} strokeLinecap={dash === '2 4' ? 'round' : undefined} />
    </svg>
  );
}

/**
 * Appearance of a node, subgraph or class (`fill`, `stroke`, `stroke-width`, `stroke-dasharray`,
 * `color`, bold, italic), or of an edge (`stroke`, `stroke-width`, label `color`).
 */
export function AppearanceFields({ styles, kind, onChange }: { styles: readonly string[] | undefined; kind: 'box' | 'edge'; onChange: (styles: string[]) => void }): JSX.Element {
  const get = (p: string): string => declarationValue(styles, p);
  const set = (p: string, v: string): void => onChange(withDeclaration(styles, p, v));
  const width = get('stroke-width');
  const widthOptions = WIDTHS.includes(width) ? WIDTHS : [...WIDTHS, width];
  const dash = get('stroke-dasharray');
  return (
    <div className="appearance">
      {kind === 'box' && <ColorField label="Fill" value={get('fill')} palette={FILL_COLORS} onChange={(v) => set('fill', v)} />}
      <ColorField label={kind === 'box' ? 'Border' : 'Line color'} value={get('stroke')} palette={LINE_COLORS} onChange={(v) => set('stroke', v)} />
      <Segmented
        label={kind === 'box' ? 'Border width' : 'Line width'}
        value={width}
        options={widthOptions.map((w) => ({ value: w, label: w === '' ? 'Auto' : <LineSample width={w} />, title: w === '' ? 'The theme default' : `stroke-width: ${w}` }))}
        onChange={(v) => set('stroke-width', v)}
      />
      {kind === 'box' && (
        <Segmented
          label="Border style"
          value={DASHES.some((d) => d.value === dash) ? dash : 'custom'}
          options={[
            ...DASHES.map((d) => ({ value: d.value, label: <LineSample width="2px" dash={d.value} />, title: d.title })),
            ...(DASHES.some((d) => d.value === dash) ? [] : [{ value: 'custom', label: 'Custom', title: `stroke-dasharray: ${dash}` }]),
          ]}
          onChange={(v) => v !== 'custom' && set('stroke-dasharray', v)}
        />
      )}
      <ColorField label={kind === 'box' ? 'Text' : 'Label text'} value={get('color')} palette={LINE_COLORS} onChange={(v) => set('color', v)} />
      {kind === 'box' && (
        <div className="segmented-field">
          <span className="color-field-label">Text style</span>
          <div className="segmented">
            <button type="button" aria-pressed={get('font-weight') === 'bold'} className={get('font-weight') === 'bold' ? 'selected' : undefined} title="font-weight: bold" onClick={() => set('font-weight', get('font-weight') === 'bold' ? '' : 'bold')}>
              <b>B</b>
            </button>
            <button type="button" aria-pressed={get('font-style') === 'italic'} className={get('font-style') === 'italic' ? 'selected' : undefined} title="font-style: italic" onClick={() => set('font-style', get('font-style') === 'italic' ? '' : 'italic')}>
              <i>I</i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A preview of a class or a style: a small box with its fill, border and text. */
export function StyleSwatch({ styles, text = 'Aa' }: { styles: readonly string[]; text?: string }): JSX.Element {
  const v = (p: string): string | undefined => declarationValue(styles, p) || undefined;
  const width = v('stroke-width');
  return (
    <span
      className="style-swatch"
      aria-hidden="true"
      style={{
        background: v('fill'),
        borderColor: v('stroke'),
        borderWidth: width ? (/^\d+(\.\d+)?$/.test(width) ? `${width}px` : width) : undefined,
        borderStyle: v('stroke-dasharray') ? 'dashed' : undefined,
        // Mermaid's dark default text on a fill without its own text color, also in dark mode.
        color: v('color') ?? (v('fill') ? '#333333' : undefined),
        fontWeight: v('font-weight'),
        fontStyle: v('font-style'),
      }}
    >
      {text}
    </span>
  );
}

/** The classes of an element as chips: click a class to add or remove it. */
export function ClassChips({ model, classes, onChange }: { model: FlowModel; classes: readonly string[] | undefined; onChange: (classes: string[]) => void }): JSX.Element {
  const defs = (model.classDefs ?? []).filter((c) => c.name !== 'default');
  const has = new Set(classes ?? []);
  // Classes the element uses that no classDef defines are kept and shown, so they can be removed.
  const undefinedClasses = [...has].filter((c) => !defs.some((d) => d.name === c));
  return (
    <div className="class-chips-field">
      <span className="color-field-label">Classes</span>
      {defs.length === 0 && undefinedClasses.length === 0 ? (
        <span className="muted class-chips-empty">None defined yet. Open Classes in the toolbar to make one.</span>
      ) : (
        <div className="class-chips">
          {defs.map((d) => (
            <button
              key={d.name}
              type="button"
              className={`class-chip${has.has(d.name) ? ' on' : ''}`}
              aria-pressed={has.has(d.name)}
              title={`${has.has(d.name) ? 'Remove' : 'Add'} class ${d.name}: ${d.styles.join('; ') || 'no styles'}`}
              onClick={() => onChange(has.has(d.name) ? [...has].filter((c) => c !== d.name) : [...has, d.name])}
            >
              <StyleSwatch styles={d.styles} text="" />
              {d.name}
            </button>
          ))}
          {undefinedClasses.map((c) => (
            <button key={c} type="button" className="class-chip on undefined" aria-pressed title={`Class ${c} has no classDef. Click to remove it.`} onClick={() => onChange([...has].filter((x) => x !== c))}>
              {c} ?
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Picture of an edge line style. */
function StrokeSample({ stroke }: { stroke: Stroke }): JSX.Element {
  const width = stroke === 'thick' ? 3.5 : 1.5;
  return (
    <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true">
      <line x1="2" y1="6" x2="32" y2="6" stroke="currentColor" strokeWidth={width} strokeDasharray={stroke === 'dotted' ? '3 3' : stroke === 'invisible' ? '1 4' : undefined} opacity={stroke === 'invisible' ? 0.4 : 1} />
    </svg>
  );
}

const STROKE_TEXT: Record<Stroke, string> = {
  normal: 'Normal line (-->)',
  dotted: 'Dotted line (-.->)',
  thick: 'Thick line (==>)',
  invisible: 'Invisible link (~~~): used for the layout, not drawn',
};

export function StrokePicker({ value, onChange }: { value: Stroke; onChange: (stroke: Stroke) => void }): JSX.Element {
  return (
    <Segmented
      label="Line"
      value={value}
      options={(['normal', 'dotted', 'thick', 'invisible'] as const).map((s) => ({ value: s, label: <StrokeSample stroke={s} />, title: STROKE_TEXT[s] }))}
      onChange={onChange}
    />
  );
}

/** Picture of an end marker, pointing right. */
function EndSample({ end }: { end: EdgeEnd }): JSX.Element {
  return (
    <svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true">
      <line x1="2" y1="7" x2={end === 'none' ? 28 : 21} y2="7" stroke="currentColor" strokeWidth="1.5" />
      {end === 'arrow' && <path d="M20 2 L28 7 L20 12 Z" fill="currentColor" />}
      {end === 'circle' && <circle cx="24" cy="7" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {end === 'cross' && <path d="M20 3 L28 11 M28 3 L20 11" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
}

const END_TEXT: Record<EdgeEnd, string> = {
  none: 'No marker (---)',
  arrow: 'Arrow (-->)',
  circle: 'Circle (--o)',
  cross: 'Cross (--x)',
};

export function EndPicker({ value, bothEnds, disabled, onChange, onBothEnds }: {
  value: EdgeEnd;
  bothEnds: boolean;
  disabled: boolean;
  onChange: (end: EdgeEnd) => void;
  onBothEnds: (both: boolean) => void;
}): JSX.Element {
  return (
    <>
      <Segmented
        label="End marker"
        value={value}
        title={disabled ? 'An invisible link has no markers' : undefined}
        options={(['none', 'arrow', 'circle', 'cross'] as const).map((e) => ({ value: e, label: <EndSample end={e} />, title: END_TEXT[e], disabled }))}
        onChange={onChange}
      />
      <label className="checkbox" title="The same marker at the start too (<-->, o--o, x--x)">
        <input type="checkbox" checked={bothEnds} disabled={disabled || value === 'none'} onChange={(e) => onBothEnds(e.target.checked)} />
        Marker at both ends
      </label>
    </>
  );
}
