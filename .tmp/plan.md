# Plan: upcoming work

## Status (2026-11-14)

Done:
- **Phase 8**: 81 examples of every type are in the gallery (`src/mermaidExamples.ts`): the features of the "All
  Diagram Examples" page, with our own subjects, names and connections (not copies of the page), grouped by type, with a badge per example; the snapshot test guards them.
- **Phase 9**: every type parses; other types show Mermaid's drawing (`Preview.tsx`, pan/zoom/fit) instead of an error.
  All Mermaid calls go through one queue (`withMermaid` in `parse.ts`): overlapping parses mixed DB state.
- **Phase 13**: header completion for all types, a generic highlighting mode with per-type keywords
  (`diagramTypes.ts`), error marks counted from any header line.
- **Phase 10**: `swimlane-beta` on the canvas (`model.kind: 'swimlane'`), lanes as bands, ELK partitions, + Lane.
- **Phase 11.1**: state diagrams on the canvas (`stateDiagram.ts`): states, `[*]`, choice/fork/join, composites,
  concurrency regions, notes, styling. Comments move to the end. Floating notes fall back to the preview.
- **Phase 11.2**: use case diagrams on the canvas (`usecaseDiagram.ts`): actors, use cases, boundaries, notes, all
  association arrows, include/extend/generalization. Edge ids/animation and JSON nodes fall back to the preview.
- **Phase 12 (partial)**: outline editor (mindmap, ishikawa, treeView, treemap, kanban, venn); table editors for pie,
  sankey, packet, radar, xychart, quadrant, timeline, journey, gantt, gitGraph; relation tables for sequence, class,
  ER, requirement, C4, architecture, use case, block.

Left:
- Phase 11.3–11.6 on the canvas: block (grid layout), architecture (ports), class and ER (compartments),
  requirement, C4. Today they have a relation table only; their nodes are edited in the code.
- Phase 12: kanban as a real board (drag between columns), sequence editor beyond the message table (participants,
  blocks, notes), quadrant points dragged on the preview.
- Flowchart leftovers (below).

Merbutler edits Mermaid flowcharts visually. All 100 flowchart gallery examples are editable without losing code
(shapes, styling, click, collapsed subgraphs, icons and images, edge animation and curves, themes and looks, ELK
layout, comments). This plan lists what is left.

## All diagram types

Source: https://mermaid.js.org/syntax/all-examples.html

The "All Diagram Examples" page (docs for Mermaid 12.3.0) has 81 examples of 31 diagram types; 4 are flowcharts.
Checked against the installed Mermaid (12.3.0, pinned):

- **Every type parses** with it, including the betas (`swimlane-beta`, `venn-beta`, `treeView-beta`, `railroad-*`, …).
  No Mermaid upgrade is needed.
- **All 4 flowchart examples are already editable** on the canvas (subgraphs, `style`, `@{ shape }`, `fa:fa-car`).
- **`swimlane-beta` uses the flowchart DB** (`getVertices`, `getEdges`, `getSubGraphs`, `getDirection`): same nodes,
  shapes, edges and subgraphs (= lanes). It can share the whole flowchart pipeline.

Today the app rejects every other type ("Only flowcharts are supported") and shows nothing on the canvas.

### Types on the page

| Type | Keyword | Examples | Shape of the data | Plan |
|---|---|---|---|---|
| Flowchart | `flowchart` | 4 | graph | editable; Phase 8 adds the 4 examples to the gallery |
| Swimlane | `swimlane-beta LR` | 2 | graph + lanes (flowchart DB) | Phase 10: editable |
| State | `stateDiagram-v2` | 3 | graph + composite states, choice, concurrency, notes | Phase 11 (first) |
| Use case | `usecase-beta` | 3 | graph: actors, use cases, system boundaries | Phase 11 |
| Block | `block-beta` | 2 | graph on a grid (`columns`, `space`, block arrows) | Phase 11 |
| Architecture | `architecture-beta` | 3 | graph: groups, services with icons, junctions, side-anchored edges (`db:L -- R:server`) | Phase 11 |
| Class | `classDiagram` | 2 | graph, nodes with members, relation types and cardinalities, notes | Phase 11 |
| Entity relationship | `erDiagram` | 2 | graph, entities with attributes (PK/FK/UK), crow's-foot cardinalities | Phase 11 |
| Requirement | `requirementDiagram` | 1 | graph of requirements and elements with typed relations | Phase 11 (late) |
| C4 | `C4Context`, `C4Container` | 2 | nested boundaries, people, systems, relations | Phase 11 (late) |
| Mindmap | `mindmap` | 2 | tree by indentation, shapes, `::icon()` | Phase 12 (outline) |
| Ishikawa | `ishikawa-beta` | 2 | tree by indentation | Phase 12 (outline) |
| TreeView | `treeView-beta` | 5 | tree by indentation, icons, annotations | Phase 12 (outline) |
| Kanban | `kanban` | 2 | columns of cards with `@{ priority, assigned, ticket }` | Phase 12 (board) |
| Sequence | `sequenceDiagram` | 3 | participants, messages, activations, `alt`/`par`/`loop`, notes | Phase 12 (own editor, L) |
| Gantt | `gantt` | 2 | sections of tasks with dates and dependencies | Phase 12 (table) |
| Timeline | `timeline` | 2 | sections of periods with events | Phase 12 (table) |
| User journey | `journey` | 2 | sections of tasks with score and actors | Phase 12 (table) |
| Git graph | `gitGraph` | 3 | commits, branches, merges, cherry-picks, tags | Phase 12 (table) |
| Pie | `pie` | 2 | label → value | Phase 12 (table) |
| XY chart | `xychart-beta` | 3 | axes, bar and line series | Phase 12 (table) |
| Sankey | `sankey-beta` | 3 | CSV: source, target, value | Phase 12 (table) |
| Quadrant | `quadrantChart` | 2 | axes, quadrant names, points (x, y), classes | Phase 12 (table / drag points) |
| Radar | `radar-beta` | 2 | axes, curves of values | Phase 12 (table) |
| Treemap | `treemap-beta` | 2 | tree of labels with values | Phase 12 (outline) |
| Venn | `venn-beta` | 2 | sets, unions, sizes, texts | Phase 12 (table) |
| Packet | `packet` | 2 | bit ranges with labels | Phase 12 (table) |
| Event modeling | `eventmodeling` | 2 | time frames of UI/command/event/read models | preview only |
| Wardley map | `wardley-beta` | 4 | components at coordinates, links, pipelines | preview only (maybe drag later) |
| Cynefin | `cynefin-beta` | 2 | items in five domains, transitions | preview only |
| Railroad (IR, EBNF, ABNF, PEG) | `railroad-beta`, `railroad-ebnf-beta`, `railroad-abnf-beta`, `railroad-peg-beta` | 8 | grammar rules | preview only |

### Phase 8: the page's flowchart examples in the gallery (S)

Add the 4 flowchart examples verbatim to `src/gallery.ts` (a "From the Mermaid examples" group). They are editable
today; the gallery snapshot then guards them.

### Phase 9: every type in the app, with a preview (M) — do this first among the new phases

Today a non-flowchart diagram makes the canvas show only an error. Instead:

- `parse.ts` returns the diagram type for any diagram Mermaid accepts, and "flowchart" vs "other".
- For other types, the right pane shows **Mermaid's own rendering** (`mermaid.render`, securityLevel strict, the
  bundled icon packs), with pan and zoom, re-rendered after the code settles (like the canvas today). A badge says
  "Preview — edit in the code"; syntax errors keep the existing error panel. Same theming and dark-mode handling as the
  gallery previews.
- The gallery gets the other 77 examples, grouped by type, with a "Preview" badge (and "Editable" once a later phase
  makes the type editable), so the support status of every type is visible and snapshot-tested.
- File open/save, paste (code fences tagged `mermaid`) and copy already work for any text.

### Phase 10: `swimlane-beta` editable (M)

- Accept the `swimlane` type in `parse.ts` (same DB). `model.kind: 'flowchart' | 'swimlane'`; the serializer writes
  `swimlane-beta <dir>`. Everything else (shapes, edges, styling, comments, click) is shared.
- Canvas: top-level subgraphs are lanes: bands across the whole diagram, perpendicular to the flow direction, title at
  the lane start. Layout: ELK with one partition per lane (`elk.partitioning.activate`, `elk.partitioning.partition`),
  so the layered order keeps lanes as rows/columns; nodes outside lanes get their own band.
- Inspector: "Lane" instead of "Subgraph"; toolbar "+ Lane".

### Phase 11: visual editing for graph-like types (L each; one PR per type)

Generalize the model and canvas from "a flowchart" to "a graph of a diagram type": each type brings a parser
adapter (its Mermaid DB → nodes, edges, groups), a serializer, its node views, and its inspector fields. Mermaid's
DBs are internal, so pin and test them like the flowchart DB today.

Order by closeness to the flowchart, and value:
1. **State** — states, transitions with labels, composite states (= subgraphs, own direction), `[*]` start/end,
   `<<choice>>`/`<<fork>>`/`<<join>>`, notes, concurrency regions (`--`). Most requested after flowcharts.
2. **Use case** — actors, use cases, `systemBoundary` (= subgraph), `@{ type: package }`.
3. **Block** — the same node shapes as flowcharts, but a grid layout from `columns`, `space` and spans (`:3`); a
   grid layout engine instead of ELK.
4. **Architecture** — groups, services with icons (iconify packs, like icon shapes), junctions, edges anchored to
   sides (ELK ports).
5. **Class** and **ER** — nodes with member/attribute compartments, relation types (inheritance, composition,
   crow's foot) as edge markers, cardinality labels at both ends.
6. **Requirement**, **C4** — later.

### Phase 12: structured editors for trees, boards and data (M each)

These are not node-and-edge graphs, so a canvas is the wrong tool. Edit them in a side panel next to the Mermaid
preview from Phase 9, writing the code back like the canvas does:
- **Outline editor** (indentation trees): mindmap, ishikawa, treeView, treemap — add, indent/outdent, move, rename,
  shape/icon/value per item.
- **Board**: kanban — columns and cards, drag between columns, card metadata.
- **Tables**: pie, sankey, xychart, radar, venn, packet, quadrant (also drag points on the preview), timeline,
  journey, gantt (dates, durations, `after` dependencies), gitGraph (a commit list).
- **Sequence diagram**: its own editor (participants as columns, messages as rows, blocks for alt/par/loop). Large.

### Phase 13: the code editor for every type (S–M)

- Header completion: all 35 type keywords (with `-beta` names).
- Highlighting: a fallback mode for other types (keywords per type, strings, comments, arrows, numbers); the
  flowchart mode stays as is. Per-type keyword lists from the examples above.
- Error marks: Mermaid's line numbers are per type too; reuse `mermaidLineToDocLine`.

### Not planned beyond preview

Event modeling, Wardley maps, Cynefin and the four railroad dialects: preview (Phase 9), highlighting (Phase 13).

## Suggested order

1. Phase 8 (S) and Phase 9 (M): every diagram works in the app at once, with Mermaid's preview, and the gallery shows
   all 81 examples with their status.
2. Phase 13 header completion and fallback highlighting (S).
3. Phase 10: swimlanes, the cheapest new editable type.
4. Phase 11.1: state diagrams; then the other graph types by demand.
5. Phase 12: outline editor first (four types at once), then tables, then the sequence editor.

## Flowchart leftovers (small, optional)

- Per-edge length (`--->`) with ELK: ELK layered has no per-edge minimum length; only dagre uses it.
- `handDrawn` look: Mermaid's hatched fills (the canvas only wobbles the outlines).
- Theme font sizes: the canvas keeps 14px labels (themes use 14 or 16px).
- Subgraph titles centered, as Mermaid draws them (the canvas puts them top left, next to the collapse arrow).
- Formatting on a canvas edit: blank lines, statement order, `:::` vs `class` and bracket spacing are regenerated.
  Keeping them needs a writer that patches the original text instead of rewriting it. Only if users ask.
