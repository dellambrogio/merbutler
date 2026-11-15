/**
 * The palette panel: ready-made sets of classes. ＋ Add writes a set's classDefs; a color dragged onto
 * a node, subgraph or edge applies its class, creating it if needed.
 */
import type { JSX } from 'react';
import { addClassDefs, type FlowModel } from '../core/model';
import { CLASS_SETS } from '../flowchart/palette';
import { startClassDrag } from '../canvas/classDrag';
import { Panel } from './Panel';

export function PalettePanel({ model, onChange, onClose }: {
  model: FlowModel;
  onChange: (model: FlowModel) => void;
  onClose: () => void;
}): JSX.Element {
  const defs = model.classDefs ?? [];
  return (
    <Panel
      name="palette"
      title="Palettes"
      meta={CLASS_SETS.length}
      onClose={onClose}
      hint="＋ Add writes a palette's classes. Drag a color onto an element to give it that class (Shift adds it)."
    >
      <div className="class-sets">
        {CLASS_SETS.map((set) => {
          const missing = set.classes.filter((c) => !defs.some((d) => d.name === c.name));
          return (
            <div key={set.name} className="class-set">
              <div className="class-set-head">
                <strong>{set.name}</strong>
                <span className="muted class-set-names">
                  {set.prefix}-1…{set.classes.length}
                </span>
                <button
                  type="button"
                  disabled={missing.length === 0}
                  title={missing.length === 0 ? 'All its classes exist already' : `Add ${missing.map((c) => c.name).join(', ')}`}
                  onClick={() => onChange(addClassDefs(model, missing))}
                >
                  {missing.length === 0 ? 'Added' : missing.length === set.classes.length ? '＋ Add' : `＋ Add ${missing.length}`}
                </button>
              </div>
              <div className="class-set-preview">
                {set.classes.map((c, i) => (
                  <span
                    key={c.name}
                    draggable
                    onDragStart={(e) => startClassDrag(e, c.name, c.styles)}
                    title={`${c.name}: drag onto an element to apply it`}
                    style={{ background: set.colors[i] }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
