import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react';
import { renderMermaid } from './render';

interface PreviewProps {
  /** Code that Mermaid accepts. A new value is rendered; the last drawing stays until it is ready. */
  code: string;
  /** The diagram type's name, for the badge. */
  typeName: string;
  /** True while the code in the editor does not parse: the drawing is of older code. */
  stale: boolean;
  /** Why the canvas does not edit this diagram, for a type it usually edits. */
  reason?: string;
  /** Where else the diagram can be edited, for example "the outline". */
  editor?: string;
}

interface View {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const PADDING = 24;

/** The SVG's own size, from its viewBox (Mermaid sets width 100% and a max-width). */
function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const box = svg.viewBox.baseVal;
  if (box && box.width > 0 && box.height > 0) return { width: box.width, height: box.height };
  const rect = svg.getBoundingClientRect();
  return { width: rect.width || 400, height: rect.height || 300 };
}

/**
 * Mermaid's own drawing of a diagram type the canvas does not edit, with pan (drag) and zoom
 * (wheel, buttons). Edit the diagram in the code.
 */
export function Preview({ code, typeName, stale, reason, editor }: PreviewProps): JSX.Element {
  const [svg, setSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const host = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  /** Fit the next drawing: true at first, and when the diagram type changes. */
  const fitNext = useRef(true);
  const lastType = useRef(typeName);

  if (lastType.current !== typeName) {
    lastType.current = typeName;
    fitNext.current = true;
  }

  useEffect(() => {
    let alive = true;
    void renderMermaid(code).then((result) => {
      if (!alive) return;
      if ('svg' in result) {
        setSvg(result.svg);
        setRenderError(null);
      } else {
        setRenderError(result.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [code]);

  const fit = useCallback((): void => {
    const el = host.current;
    const drawing = content.current?.querySelector('svg');
    if (!el || !drawing) return;
    const { width, height } = svgSize(drawing);
    const zoom = Math.min(1.5, Math.max(MIN_ZOOM, Math.min((el.clientWidth - 2 * PADDING) / width, (el.clientHeight - 2 * PADDING) / height)));
    setView({ zoom, x: (el.clientWidth - width * zoom) / 2, y: (el.clientHeight - height * zoom) / 2 });
  }, []);

  // Give the SVG its natural size, so the transform alone scales it.
  useLayoutEffect(() => {
    const drawing = content.current?.querySelector('svg');
    if (!drawing) return;
    const { width, height } = svgSize(drawing);
    drawing.style.maxWidth = 'none';
    drawing.setAttribute('width', String(width));
    drawing.setAttribute('height', String(height));
    if (fitNext.current) {
      fitNext.current = false;
      fit();
    }
  }, [svg, fit]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number): void => {
    const el = host.current;
    if (!el) return;
    const px = cx ?? el.clientWidth / 2;
    const py = cy ?? el.clientHeight / 2;
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const k = zoom / v.zoom;
      return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  // A non-passive listener, so the wheel zooms the drawing instead of scrolling the page.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002)), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  };
  const onPointerUp = (): void => {
    drag.current = null;
  };

  return (
    <div className="preview">
      <div className="preview-toolbar">
        <span className="badge preview-badge">Preview</span>
        <span className="preview-type">{typeName}</span>
        <span className="muted" title={reason}>
          {reason ? `${reason.replace(/^Not supported by the visual editor: /, 'The canvas cannot keep ')}. Edit it in the code.` : `Drawn by Mermaid. Edit it in ${editor ? `the ${editor} or ` : ''}the code.`}
        </span>
        <span className="spacer" />
        <button onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out" title="Zoom out">
          −
        </button>
        <button className="preview-zoom" onClick={() => zoomAt(1 / view.zoom)} title="Actual size">
          {Math.round(view.zoom * 100)}%
        </button>
        <button onClick={() => zoomAt(1.25)} aria-label="Zoom in" title="Zoom in">
          +
        </button>
        <button onClick={fit} title="Fit the diagram in the pane">
          Fit
        </button>
      </div>
      <div
        className={`preview-surface${stale ? ' stale' : ''}`}
        ref={host}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fit}
      >
        {svg ? (
          <div
            className="preview-content"
            ref={content}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
            // Mermaid renders with securityLevel 'strict': no scripts, sanitized labels.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          !renderError && <div className="placeholder">Rendering…</div>
        )}
        {renderError && (
          <div className="preview-error" role="alert">
            Mermaid could not draw this diagram: {renderError}
          </div>
        )}
      </div>
    </div>
  );
}
