# Merbutler

**A visual editor for Mermaid diagrams.** Edit the code or the canvas, and the other side follows.

Flowcharts, swimlanes and state diagrams are edited on a canvas. Trees (mindmaps, treemaps, kanban boards, …) get an
outline editor, and data diagrams (pie, gantt, sequence messages, …) a table, next to Mermaid's own drawing. Every
other Mermaid diagram type opens as a preview.

Paste a flowchart from a doc or an agent's answer, rearrange it with the mouse, and copy clean Mermaid back out.
Everything runs in the browser: no server, no account.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img alt="Merbutler: Mermaid code on the left, the editable flowchart on the right" src="docs/screenshot-light.png">
</picture>

### Demo

![Typing code updates the canvas; renaming, reshaping, adding and connecting nodes on the canvas updates the code](docs/demo.gif)

Type code and the canvas follows. Rename a node, change its shape, add and connect nodes, or flip the direction,
and the code follows. ([MP4 version](docs/demo.mp4))

### How the sync works

```mermaid
flowchart LR
  code[/"Mermaid code"/] -- parse --> model[(Graph model)]
  model -- serialize --> code
  model -- "ELK or dagre layout" --> canvas["Canvas"]
  canvas -- edit --> model
```

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Code editor](#code-editor)
- [Paste](#paste)
- [Canvas actions](#canvas-actions)
- [Every diagram type](#every-diagram-type)
- [Supported Mermaid subset](#supported-mermaid-subset)
- [Known limitations](#known-limitations)
- [Project layout](#project-layout)
- [License](#license)

## Features

- ✍️ **Two-way sync**: type code and the canvas updates; edit the canvas and the code is regenerated.
- 🧩 **Subgraphs**: nested, with their own direction, and edges to or from a whole subgraph.
- 🔷 **All 53 node shapes** and all Mermaid flowchart edge styles and end markers.
- 📝 **Rich labels**: quoted text, line breaks and Markdown bold/italic.
- 📋 **Smart paste**: strips Markdown code fences, so you can paste a chat answer as it is.
- 🛡️ **Safe by design**: unsupported syntax makes the canvas read-only instead of losing your code,
  and HTML in labels never runs.
- 🗂️ **Every Mermaid diagram type**: the canvas edits flowcharts, swimlanes (`swimlane-beta`) and state diagrams;
  outline and table editors cover the others; the rest open as Mermaid's own drawing, with pan and zoom.
- 🖼️ **Gallery**: one example per feature of the Mermaid flowchart syntax, and all 81 examples of Mermaid's
  "All Diagram Examples" page, drawn by Mermaid, with a badge that says how the app edits each. Click one to open it.
- 💾 **Autosave**: the code is kept in localStorage between sessions.

## Quick start

You need [Node.js](https://nodejs.org/) and [just](https://github.com/casey/just).

```sh
just install
just dev        # open the URL that Vite prints
```

| Recipe | What it does |
|---|---|
| `just dev` | Start the dev server |
| `just test` / `just watch` | Run the tests once / in watch mode |
| `just check` | Type-check without building |
| `just ci` | Type-check and test |
| `just build` | Type-check and build to `dist/` |
| `just preview` | Build and serve the production build |
| `just clean` | Remove build output |

`just` alone lists all recipes. Without `just`, use `npm install`, `npm run dev`, `npm test` and `npm run build`.

## How it works

- **Code → canvas:** the code is parsed 300 ms after you stop typing. If the parse fails,
  the canvas keeps the last valid diagram and becomes read-only until the code is valid again.
- **Canvas → code:** each canvas edit regenerates the full code from the model.
- **View:** it fits the diagram again when nodes are added or removed, or the direction changes.
  Renames and style edits do not move the view.
- **Layout** is automatic and uses the engine Mermaid 12 uses: ELK, or dagre when the config says `layout: dagre`.
  With ELK, edges follow the routes ELK found, as in Mermaid. You can drag nodes (their edges then draw a plain curve),
  but the next edit or **Re-layout** resets the positions.

## Code editor

- **Syntax highlighting** for the flowchart syntax (keywords, edges, labels, `@{}` data, styling, front matter,
  comments), in light and dark mode. Other diagram types get a simpler mode: their keywords, strings, numbers,
  arrows and comments.
- **Header completion** for all diagram types (`sequenceDiagram`, `stateDiagram-v2`, `xychart-beta`, …), and each
  type's keywords at the start of a line.
- **Autocompletion** (as you type, or Ctrl+Space): statements, directions, node and subgraph ids of the diagram,
  all shape names and aliases in `@{ shape: … }`, `@{}` keys and values, class names, curves, themes and looks in the
  front matter, and FontAwesome icon names after `fa:fa-` or in `icon: "…"`.
- **Errors** are underlined on their line, with a mark in the gutter (Mermaid's line numbers are mapped back to the
  editor's, also when comments were removed).
- **Editing:** Ctrl+/ toggles `%%` comments, Tab indents (Esc then Tab leaves the editor), lines inside a subgraph
  indent automatically and `end` steps back, brackets and quotes close, Ctrl+F searches.
- **Text size:** **A−** / **A+** above the code (Ctrl+Alt+− / Ctrl+Alt+=, Ctrl+Alt+0 resets). It is remembered.

## Paste

- **Paste** button, or **Ctrl+V on the canvas**: replaces the whole code with the clipboard.
- Markdown code fences are removed. If the text has several blocks, the first `mermaid` block is used.
  This lets you copy an agent's answer as it is.
- Ctrl+V in the code panel removes the fence only when the paste replaces all the code
  (empty editor or all text selected). Other pastes insert the text as it is.
- Ctrl+Z in the code panel undoes a paste.
- The Paste button needs clipboard permission. If the browser blocks it, use Ctrl+V on the canvas.

## Canvas actions

| Action | How |
|---|---|
| Add node | **+ Node** (goes into the selected subgraph, or next to the selected node) |
| Add subgraph | **+ Subgraph** (same rule) |
| Rename node | Double-click the node, or use the inspector. **Enter** saves, **Shift+Enter** adds a line break |
| Rename subgraph | Double-click its title, or use the inspector |
| Move into / out of a subgraph | Select the node or subgraph → inspector → **Subgraph** |
| Markdown label | Select the node, edge or subgraph → inspector → **Markdown** |
| Change shape | Select the node → inspector |
| Connect | Hover over a node or subgraph to show its handles, then drag from a handle and drop it on a handle of another node or subgraph |
| Edge label, stroke, end marker, both ends | Select the edge → inspector |
| Delete | Select, then `Delete`/`Backspace`, or the inspector button. Deleting a subgraph keeps its contents: they move up one level |
| Direction | Toolbar select |

## Every diagram type

| Diagram types | How the app edits them |
|---|---|
| Flowchart, swimlane (`swimlane-beta`) | **Canvas.** Swimlanes are drawn as lanes (rows for `LR`, columns for `TB`), laid out with one ELK partition per lane. **+ Lane** adds one |
| State diagram (`stateDiagram-v2`) | **Canvas.** States, `[*]` start and end (**+ Start**, **+ End**, per composite state), choice, fork and join, composite states (**+ Composite**) with their own direction, concurrency regions (inspector → **+ Concurrent region**), notes (**+ Note**), transition labels, `classDef`/`class`/`style`. Comments are kept, at the end. What the canvas cannot keep (a floating note) opens as a preview that says why |
| Mindmap, ishikawa, treeView, treemap, kanban, venn | **Outline editor** next to the preview: add, indent (Tab), outdent (Shift+Tab), move (Alt+↑/↓), delete; typed fields per type (mindmap shape and icon, treemap value, tree view annotation, kanban card data) |
| Pie, sankey, packet, radar, XY chart, quadrant, timeline, user journey, gantt, git graph | **Table editor** next to the preview: one row per data line (sections as headings). Other lines (title, axes, settings) stay in the code |
| Sequence, class, ER, requirement, C4, architecture, use case, block | **Table of relations** next to the preview (messages, relations, relationships, edges). Participants, classes, entities and blocks are edited in the code |
| Event modeling, Wardley map, Cynefin, railroad (IR, EBNF, ABNF, PEG) | **Preview** only: edit them in the code |

The outline and table editors write only the lines they change (the outline rewrites the tree's indentation).
Mermaid draws every preview with `securityLevel: strict`, the same as the gallery.

## Supported Mermaid subset

The canvas reads this flowchart syntax:

| Feature | Syntax |
|---|---|
| Diagram | `flowchart` / `graph` with `TB`, `TD`, `BT`, `LR`, `RL` |
| Shapes | `[rect]`, `(round)`, `([stadium])`, `[[subroutine]]`, `[(cylinder)]`, `((circle))`, `(((double circle)))`, `>flag]`, `{diamond}`, `{{hexagon}}`, `[/parallelogram/]`, `[\parallelogram\]`, `[/trapezoid\]`, `[\inverted trapezoid/]` |
| Shapes, new syntax | `A@{ shape: …, label: "…" }` with all 53 shapes of Mermaid 12.3 and their aliases, from `doc` and `cloud` to `fork` and `person`. The 14 shapes above can be written either way. The syntax and the name (alias included) are kept |
| Edge strokes | normal `--`, dotted `-.-`, thick `==`, invisible `~~~` (drawn faintly on the canvas so you can select it) |
| Edge ends | `>` arrow, `o` circle, `x` cross or none, on one end (`-->`, `--o`, `-.-x`, `==>`) or both (`<-->`, `o--o`, `x-.-x`, `<==>`) |
| Edge labels | `-->|label|` or `-- label -->` |
| Edge length | `--->`, `---->` (2 or 3 ranks) for every stroke: `-..->`, `===>`. The canvas uses it with dagre; ELK has no per-edge length |
| Edge ids | `A e1@--> B` with `e1@{ animate, animation, step, curve }`. The canvas animates the edge (two speeds; still when the system asks for reduced motion), shows step numbers, and draws `linear` and `step` curves; smooth curves use its own |
| Before the `flowchart` line | front matter (`title`, `config`), `%%{init}%%` directives and comments: kept as they are. The canvas shows the `title` |
| Themes and looks | `theme` (all 11 Mermaid 12 themes, from `default` and `forest` to `neo` and `redux-dark`), `themeVariables` (`primaryColor`, `primaryBorderColor`, `primaryTextColor`, `lineColor`, `clusterBkg`, `clusterBorder`, …) and `look` (`classic`, `neo` with shadows, `handDrawn` with wobbly outlines), from the front matter or a directive. Without them the canvas uses its own colors, which follow light and dark mode. Labels wrap at `flowchart.wrappingWidth` (200 by default) unless `markdownAutoWrap: false` |
| Styling | `classDef` (also `default`), `class`, `:::`, `style` on nodes and subgraphs, `linkStyle` (by index and `default`, also `interpolate`), classes on edges with an id. The canvas draws fill, stroke, stroke width, dashes, text color and font; other properties are kept in the code. Edit classes and style in the inspector |
| Icons and images | `A@{ icon: "fa:user", form, label, pos, h }` and `A@{ img: "…", label, pos, w, h, constraint }`. The free FontAwesome 6 packs are bundled (`fas` solid, `far` regular, `fab` brands, `fa` all three) and load only when a diagram uses an icon; other icon sets (`mdi:…`, `logos:…`) show their name. `data:` images are shown at once; images from a server only after you click **Load** for that server (for this session), so a pasted diagram never makes the canvas contact a server on its own |
| FontAwesome in labels | `fa:fa-twitter`, `fab:fa-github`, … drawn as icons from the bundled packs, as Mermaid does with registered packs. Paid packs (`fal`, `fak`) stay text |
| Interaction | `click id …` in every form (link, `href`, callback, `call fn()`, tooltip, target), kept exactly as written and shown as a badge. The canvas never follows a link or runs a callback |
| Collapsed subgraphs | `id@{ view: collapsed }`: drawn as one box, edges that cross its border end at the box, like Mermaid. Toggle with the arrow in its title or the inspector |
| Labels | quoted text with any characters (`"a & (b)"`), `<br>` line breaks, Markdown strings (`` "`**bold** and *italic*`" ``) on nodes, edges and subgraphs |
| Subgraphs | `subgraph id [Label] … end`, nested, optional `direction` inside, edges to or from a subgraph (`ingest --> store`) |

Example:

```mermaid
flowchart LR
  start --> a
  subgraph outer [Outer box]
    direction TB
    a[A]
    subgraph inner [Inner]
      b((B))
    end
  end
  a --> b --> c{"`**Done?**`"}
  c -.->|no| a
  c ==>|yes| e[(Store)]
```

Open the **Gallery** in the app to see every feature of the Mermaid flowchart syntax, every Mermaid diagram type,
and how the app edits each.

Code the canvas cannot represent shows an error, and the canvas stays read-only. This prevents a canvas edit from
deleting those parts. Today every example in the Gallery is editable, and none loses code on a canvas edit.

## Known limitations

- A canvas edit rewrites the code: formatting, blank lines and statement order are not kept. Comments are kept: each
  `%%` comment goes with the node, edge or subgraph written after it (or before `end`, before the styling statements,
  or at the end), and is written back there. Deleting the element deletes its comment.
- `direction` inside a subgraph works as in Mermaid: the canvas uses it only if no edge connects a node inside
  the subgraph to a node outside it. Edges that end at the subgraph itself are allowed.
- Without an ELK route (dagre, or after you drag a node), edges use handles on fixed sides (for example right → left
  in LR), so an edge that goes against the flow direction can cross the nodes or subgraphs between its ends.
- The canvas places nodes like Mermaid's engine, but not pixel for pixel: node sizes are estimated from the text.
- A subgraph without an id (`subgraph Some title`) gets the id Mermaid gives it (for example `subGraph3`)
  after the first canvas edit.
- Labels are trimmed. An empty node label becomes the node id.
- `@{ label: … }` is always Markdown in Mermaid. A shape that exists only in the `@{}` syntax therefore turns a
  plain label into a Markdown label (`<br>` becomes a line break). A shape with brackets keeps a plain label by
  switching to the bracket syntax.
- Some shapes have no visible label in Mermaid (`fork`, `f-circ`, `sm-circ`, `fr-circ`, `cross-circ`, `hourglass`,
  `bolt`). The canvas does the same; edit their label in the inspector.
- Mermaid removes unknown HTML tags from labels (for example `<t>`). Other tags (for example `<b>`) are kept in
  the code but shown as text on the canvas; only `<br>` is shown as a line break. HTML from pasted code never runs.
- In a plain label a line break is saved as `<br>`; in a Markdown label as a real newline.
- The canvas shows Markdown bold and italic only, as Mermaid does in labels.
- Classes are written back as `class` statements (`A:::hot` becomes `class A hot`), in `classDef` order, which is
  also the order Mermaid applies them in.
- A style value with quotes, comments or `url(…)` is kept in the code but not drawn. A fill without a text color
  gets dark or light text on the canvas so the label stays readable.
- State diagrams: a canvas edit writes each state in its composite state and each transition in the innermost
  composite that holds both ends, and moves comments to the end. A state with quotes or line breaks in its label is
  written as `id : text` lines.
- `src/parse.ts` and `src/stateDiagram.ts` use Mermaid internals (`mermaidAPI.getDiagramFromText`, the flowchart
  and state DBs). The `mermaid` version is pinned. Run `just test` after you update it.

## Project layout

Built with React, [React Flow](https://reactflow.dev/), [CodeMirror](https://codemirror.net/),
[ELK](https://eclipse.dev/elk/), [dagre](https://github.com/dagrejs/dagre) and [Mermaid](https://mermaid.js.org/)'s own parser.

| File | Purpose |
|---|---|
| `src/model.ts` | Graph model and edit operations |
| `src/styling.ts` | How classDef/class/style/linkStyle look on the canvas |
| `src/AssetView.tsx` | Icon and image nodes, and consent for remote images |
| `src/shapes.ts` | All node shapes: names, aliases, bracket syntax, sizes, label placement |
| `src/parse.ts` | Mermaid text → model, or the type to preview |
| `src/serialize.ts` | Model → Mermaid text |
| `src/stateDiagram.ts` | State diagrams: Mermaid's state DB → model, and model → `stateDiagram-v2` |
| `src/diagramTypes.ts` | Every Mermaid diagram type: ids, header keywords, body keywords, support |
| `src/Preview.tsx`, `src/render.ts` | Mermaid's own drawing, with pan and zoom; one Mermaid call at a time |
| `src/outline.ts`, `src/OutlineEditor.tsx` | Indentation trees and the outline editor |
| `src/tables.tsx`, `src/StructuredEditor.tsx` | Table editors per type, and the panel next to the preview |
| `src/mermaidExamples.ts` | The 81 examples of Mermaid's "All Diagram Examples" page |
| `src/layout.ts`, `src/layoutEngine.ts` | Model → positioned React Flow nodes and edges, with dagre or ELK |
| `src/labels.ts`, `src/LabelText.tsx` | Label line breaks and Markdown, rendered as safe React elements |
| `src/clipboard.ts` | Extracts Mermaid code from pasted text and code fences |
| `src/Canvas.tsx` | Canvas, toolbar and inspector |
| `src/ShapeNodeView.tsx`, `src/SubgraphNodeView.tsx` | Shape outlines and subgraph boxes |
| `src/LabelEdgeView.tsx`, `src/EdgeMarkers.tsx` | Edges with HTML labels, circle and cross end markers |
| `src/CodeEditor.tsx`, `src/mermaidEditor.ts` | CodeMirror panel: highlighting, completion, error marks |
| `src/App.tsx` | Split view and sync logic |
| `src/gallery.ts`, `src/Gallery.tsx` | Syntax examples, the page's examples, and the gallery panel |
| `tests/` | Round-trip, layout, label, clipboard, swimlane, state, outline and table tests, with `.mmd` fixtures |

## License

MIT — see [LICENSE](LICENSE).
