/**
 * Mermaid text -> FlowModel for the types the canvas edits, or the type to preview for the others.
 * Mermaid parses the code; each type's adapter reads Mermaid's DB (see mermaid.ts).
 */
import mermaid from 'mermaid';
import type { FlowModel } from './model';
import { diagramType, type DiagramType } from './diagramTypes';
import { ensureInitialized, UnsupportedError, withMermaid } from './mermaid';
import { flowchartModel } from '../flowchart/parseFlowchart';
import { stateModel } from '../state/stateDiagram';
import { usecaseModel } from '../usecase/usecaseDiagram';

export { decodeEntities, ensureInitialized, preambleOf, scan, statements, UnsupportedError, withMermaid, type CodeItem } from './mermaid';
export { checkClick } from '../flowchart/parseFlowchart';

/**
 * `ok`: a diagram the canvas edits. Otherwise an error; `preview` is set when Mermaid accepts the
 * code but it is a type the canvas does not edit, so the app shows Mermaid's rendering instead.
 */
export type ParseResult = { ok: true; model: FlowModel } | { ok: false; error: string; preview?: DiagramType };

/** The canvas adapters, by diagram type name. */
const ADAPTERS: Record<string, (db: unknown, text: string, diagramId: string) => FlowModel> = {
  Flowchart: (db, text) => flowchartModel(db, text, false),
  Swimlane: (db, text) => flowchartModel(db, text, true),
  'State diagram': (db, text) => stateModel(db, text),
  'Use case diagram': (db, text) => usecaseModel(db, text),
};

export async function parse(text: string): Promise<ParseResult> {
  try {
    await ensureInitialized();
    const diagram = await withMermaid(() => mermaid.mermaidAPI.getDiagramFromText(text));
    const type = diagramType(diagram.type);
    const adapter = type.support === 'canvas' ? ADAPTERS[type.name] : undefined;
    if (!adapter) return { ok: false, error: `The canvas does not edit this type yet (${type.name}).`, preview: type };
    try {
      return { ok: true, model: adapter(diagram.db, text, diagram.type) };
    } catch (err) {
      // Mermaid accepts it but the canvas cannot keep something. Flowcharts keep the canvas read-only
      // (the last diagram stays); other types show Mermaid's drawing and say why.
      if (err instanceof UnsupportedError && type.name !== 'Flowchart' && type.name !== 'Swimlane') return { ok: false, error: err.message, preview: type };
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
