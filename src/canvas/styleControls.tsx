/**
 * Visual controls for styles: color swatches with a custom color, widths, dash patterns, text
 * styles, palette presets, and the line and marker pickers of edges. They read and write the
 * declarations of `style`, `linkStyle` and `classDef` (see `withDeclaration` in styling.ts).
 */
import { createContext, useContext, useEffect, useRef, useState, type JSX } from 'react';
import { curvePath } from './curves';
import { EDGE_CURVES, EDGE_LENGTHS, type EdgeEnd, type FlowModel, type Stroke } from '../core/model';
import { declarationValue, withDeclaration } from '../flowchart/styling';
import { PALETTE_ROWS, presets, presetStyles, type Preset } from '../flowchart/palette';

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
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): JSX.Element {
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
      <div className="color-palette">
        {PALETTE_ROWS.map((row, r) => (
          <div className="color-swatches" key={r}>
            {r === 0 ? (
              <button
                type="button"
                className={`color-swatch none${value === '' ? ' selected' : ''}`}
                title="Not set: the theme's color"
                aria-label={`${label}: not set`}
                aria-pressed={value === ''}
                onClick={() => onChange('')}
              />
            ) : (
              <span className="color-swatch-gap" />
            )}
            {row.map((c) => (
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
      <PresetPicker styles={styles} kind={kind} onChange={onChange} />
      {kind === 'box' && <ColorField label="Fill" value={get('fill')} onChange={(v) => set('fill', v)} />}
      <ColorField label={kind === 'box' ? 'Border' : 'Line color'} value={get('stroke')} onChange={(v) => set('stroke', v)} />
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
      <ColorField label={kind === 'box' ? 'Text' : 'Label text'} value={get('color')} onChange={(v) => set('color', v)} />
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

/** True when the styles already have every color of the preset. */
function hasPreset(styles: readonly string[] | undefined, preset: Preset, kind: 'box' | 'edge'): boolean {
  return presetStyles(preset, kind).every((d) => {
    const at = d.indexOf(':');
    return declarationValue(styles, d.slice(0, at)).toLowerCase() === d.slice(at + 1);
  });
}

/**
 * Ready-made looks from the palette: one click sets the fill, border and text of a box (line and
 * label of an edge) to colors of one hue. Other declarations (widths, dashes, font) are kept.
 */
export function PresetPicker({ styles, kind, onChange }: { styles: readonly string[] | undefined; kind: 'box' | 'edge'; onChange: (styles: string[]) => void }): JSX.Element {
  const rows = kind === 'box' ? (['soft', 'strong'] as const) : (['soft'] as const);
  const apply = (preset: Preset): void => {
    let next = [...(styles ?? [])];
    for (const d of presetStyles(preset, kind)) {
      const at = d.indexOf(':');
      next = withDeclaration(next, d.slice(0, at), d.slice(at + 1));
    }
    onChange(next);
  };
  return (
    <div className="segmented-field">
      <span className="color-field-label">Colors</span>
      <div className="preset-grid" role="group" aria-label="Color presets">
        {rows.map((variant) =>
          presets(variant).map((p) => {
            const on = hasPreset(styles, p, kind);
            return (
              <button
                key={p.name}
                type="button"
                className={`preset${on ? ' selected' : ''}`}
                aria-pressed={on}
                title={`${p.name}: ${presetStyles(p, kind).join(', ')}`}
                aria-label={p.name}
                style={kind === 'box' ? { background: p.fill, borderColor: p.stroke, color: p.color } : { color: p.color }}
                onClick={() => apply(p)}
              >
                {kind === 'box' ? (
                  'Aa'
                ) : (
                  <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
                    <line x1="1" y1="6" x2="16" y2="6" stroke={p.stroke} strokeWidth="2" />
                    <path d="M15 2 L21 6 L15 10 Z" fill={p.stroke} />
                  </svg>
                )}
              </button>
            );
          }),
        )}
      </div>
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

/** Opens the Classes panel of the canvas, where classes are created and edited (null: no panel). */
export const OpenClassesContext = createContext<(() => void) | null>(null);

/**
 * The class of an element: a pull-down of the defined classes, each with its name and a preview.
 * Picking one makes it the element's only class; "No class" removes them. Classes are created
 * and edited in the Classes panel, not here; the last entry opens it.
 */
export function ClassSelect({ model, classes, onChange }: { model: FlowModel; classes: readonly string[] | undefined; onChange: (classes: string[]) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const openClasses = useContext(OpenClassesContext);
  const defs = (model.classDefs ?? []).filter((c) => c.name !== 'default');
  const current = classes ?? [];
  // Classes the element uses that no classDef defines stay listed, so they can be seen.
  const options: Array<{ name: string | null; styles: readonly string[] | null }> = [
    { name: null, styles: [] },
    ...defs.map((d) => ({ name: d.name, styles: d.styles })),
    ...current.filter((c) => !defs.some((d) => d.name === c)).map((c) => ({ name: c, styles: null })),
  ];
  const stylesOf = (name: string): readonly string[] => defs.find((d) => d.name === name)?.styles ?? [];

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  // The entry after the options opens the Classes panel.
  const last = options.length - (openClasses ? 0 : 1);
  const manage = (): void => {
    setOpen(false);
    openClasses?.();
  };
  const choose = (i: number): void => (i === options.length ? manage() : pick(options[i].name));
  const pick = (name: string | null): void => {
    setOpen(false);
    const next = name === null ? [] : [name];
    if (next.length !== current.length || next.some((c, i) => c !== current[i])) onChange(next);
  };
  const show = (): void => {
    const at = options.findIndex((o) => (o.name === null ? current.length === 0 : current.includes(o.name)));
    setActive(Math.max(0, at));
    setOpen(true);
  };

  return (
    <div className="class-select-field" ref={root}>
      <span className="color-field-label" title="Written as class id name. Create and edit classes in the Classes panel of the toolbar.">
        Class
      </span>
      <button
        type="button"
        className="class-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current.length > 1 ? `Classes: ${current.join(', ')}. Picking one replaces them.` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            show();
          } else if (open && e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(last, a + 1));
          } else if (open && e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (open && e.key === 'Enter') {
            e.preventDefault();
            choose(active);
          } else if (open && (e.key === 'Escape' || e.key === 'Tab')) {
            setOpen(false);
          }
        }}
      >
        {current.length === 0 ? (
          <span className="muted">No class</span>
        ) : (
          current.map((c) => (
            <span key={c} className="class-select-value">
              <StyleSwatch styles={stylesOf(c)} />
              {c}
            </span>
          ))
        )}
        <span className="class-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul className="class-select-menu" role="listbox" aria-label="Class">
          {options.map((o, i) => {
            const selected = o.name === null ? current.length === 0 : current.includes(o.name);
            return (
              <li
                key={o.name ?? ''}
                role="option"
                aria-selected={selected}
                className={`${i === active ? 'active' : ''}${selected ? ' selected' : ''}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(o.name)}
              >
                {o.name === null ? (
                  <span className="muted">No class</span>
                ) : (
                  <>
                    {o.styles ? <StyleSwatch styles={o.styles} /> : <span className="style-swatch undefined">?</span>}
                    <span className="class-select-name">{o.name}</span>
                    {!o.styles && <span className="muted">no classDef</span>}
                  </>
                )}
              </li>
            );
          })}
          {defs.length === 0 && <li className="class-select-hint muted">No classes yet.</li>}
          {openClasses && (
            <li
              role="option"
              aria-selected={false}
              className={`class-select-manage${active === options.length ? ' active' : ''}`}
              title="Open the Classes panel: create, rename, restyle and delete classes"
              onPointerEnter={() => setActive(options.length)}
              onClick={manage}
            >
              Manage classes…
            </li>
          )}
        </ul>
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

const CURVE_TEXT: Record<string, string> = {
  basis: 'Smooth, does not pass through the bends (Mermaid\'s default)',
  bumpX: 'Smooth S-bends, flat at the ends (left to right)',
  bumpY: 'Smooth S-bends, flat at the ends (top to bottom)',
  cardinal: 'Smooth, through every bend',
  catmullRom: 'Smooth, through every bend, no loops',
  linear: 'Straight lines between the bends',
  monotoneX: 'Smooth, never overshoots (left to right)',
  monotoneY: 'Smooth, never overshoots (top to bottom)',
  natural: 'Smoothest, through every bend',
  step: 'Right angles, turning halfway',
  stepAfter: 'Right angles, turning at the end',
  stepBefore: 'Right angles, turning at the start',
};

/** The bends of the sample edge every curve is drawn through. */
const CURVE_POINTS: Array<[number, number]> = [
  [4, 22],
  [18, 6],
  [32, 20],
  [48, 5],
];

/** A small drawing of a curve through the sample bends (faint dots). */
export function CurveSample({ curve }: { curve: string }): JSX.Element {
  const d = curvePath(CURVE_POINTS, curve);
  return (
    <svg width="52" height="27" viewBox="0 0 52 27" aria-hidden="true">
      {CURVE_POINTS.map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r="1.6" fill="currentColor" opacity="0.3" />
      ))}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The curve of an edge as a grid of drawings with names. "Default" uses the diagram's curve
 * (`linkStyle default interpolate`, the config's `curve`, else basis), shown in its tile.
 */
export function CurvePicker({ value, fallback, onChange }: { value: string | undefined; fallback: string; onChange: (curve: string | undefined) => void }): JSX.Element {
  const options: Array<{ value: string | undefined; name: string; draw: string; title: string }> = [
    { value: undefined, name: 'Default', draw: fallback, title: `The diagram's curve: ${fallback}. Nothing is written for this edge.` },
    ...EDGE_CURVES.map((c) => ({ value: c, name: c, draw: c, title: CURVE_TEXT[c] ?? c })),
  ];
  return (
    <div className="segmented-field">
      <span className="color-field-label" title="Written as id@{ curve: … } for an edge with an id, else linkStyle n interpolate …">
        Curve
      </span>
      <div className="curve-grid" role="radiogroup" aria-label="Curve">
        {options.map((o) => (
          <button
            key={o.name}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`curve-option${value === o.value ? ' selected' : ''}`}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            <CurveSample curve={o.draw} />
            <span className="curve-name">{o.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** An arrow as long as an edge's minimum length (1, 2 or 3 ranks). */
function LengthSample({ ranks }: { ranks: number }): JSX.Element {
  const end = 8 + ranks * 10;
  return (
    <svg width="42" height="12" viewBox="0 0 42 12" aria-hidden="true">
      <line x1="2" y1="6" x2={end - 5} y2="6" stroke="currentColor" strokeWidth="1.5" />
      <path d={`M${end - 6} 2 L${end} 6 L${end - 6} 10 Z`} fill="currentColor" />
    </svg>
  );
}

const LENGTH_CODE: Record<number, string> = { 1: '-->', 2: '--->', 3: '---->' };

/** The minimum length of an edge in ranks, as mutually exclusive buttons. */
export function LengthPicker({ value, onChange }: { value: number; onChange: (length: number) => void }): JSX.Element {
  return (
    <Segmented
      label="Length"
      value={String(value)}
      title="Minimum length in ranks. Mermaid uses it with dagre; ELK has no per-edge length."
      options={EDGE_LENGTHS.map((n) => ({
        value: String(n),
        label: (
          <span className="length-option">
            <LengthSample ranks={n} />
            {n}
          </span>
        ),
        title: `${n} rank${n === 1 ? '' : 's'} (${LENGTH_CODE[n] ?? ''})`,
      }))}
      onChange={(v) => onChange(Number(v))}
    />
  );
}
