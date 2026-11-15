# Release notes

What changed in each version of Merbutler. The version is the one in `package.json`; the About dialog shows
these notes. New changes go under **Unreleased** until the next version gets its number and date.

## Unreleased

## 0.2.0 — 2026-11-15

- The Syntax panel is closed by default; open it from its header under the code. The app remembers it open.
- Free layout (dock → Free layout): place nodes anywhere on the canvas. Positions are kept in a
  `%% merbutler-layout` comment that Mermaid ignores, and each move sets the direction and the order of the code
  from the drawing, so other renderers lay it out close to it. What has not moved keeps Mermaid's drawing, so
  turning it on does not shift the canvas. Turning it off keeps the positions (`%% merbutler-layout off …`), so
  turning it on again puts every node back where it was placed. Not for swimlanes.
- One look for every panel: the node, edge, Diagram, Style classes, Palettes, About and Settings panels share the same
  header (title, count, ✕), hint, sections and footer. Closing the node or edge panel clears the selection.
- Resize a panel on the canvas by its bottom-right corner; a double click on the corner gives it back its size. A
  panel never grows taller than its content. The link keeps the size, as it keeps where a panel was dragged. About
  and Settings keep their size, and can be dragged anywhere in the window (a double click puts them back in the
  middle).
- A wider Palettes panel shows the palettes in more columns, as many as fit at 200px or more, filling the panel.
- **Explorer** replaces Save & open, at the top of the sidebar: the saved diagrams as a tree of folders and files.
  Create, rename and delete folders; drag diagrams and folders into folders; names are unique within a folder.
  Diagrams saved before are at the top level.
- Open a `.mmd` file from the Explorer's toolbar: it is saved as a new diagram, named after the file. Download a
  diagram as a `.mmd` file from its row. The Open .mmd / Save .mmd row is gone.
- Sidebar sections: larger titles, a click anywhere on the title bar opens or closes the section, and the sections
  under Code can be made taller or shorter by dragging their top edge (or with the arrow keys on it); Code takes the
  rest. The height is kept in this browser; a double click on the edge gives a section back its own height.
- Undo and redo in the header are a pair of arrow icons instead of two small text arrows.
- About and Settings no longer dim the app or block it: keep editing while they are open. The ✕, or Esc while one
  has the focus, closes it.
- A **Diagram** panel (dock → Diagram, a small flowchart with the direction on its corner) replaces the dock's
  Direction menu and Layout panel: the direction and the layout options in one place. Links that opened the Layout panel open it.

## 0.1.0 — 2026-11-14

The first release.

- Two-way editing of Mermaid flowcharts: type code and the canvas follows, edit the canvas and the code is
  regenerated. Subgraphs (nested, with their own direction), all 53 node shapes, every edge style and end marker,
  rich labels, `@{ … }` nodes, icon and image nodes, `click` statements, comments and front matter are kept.
- Layout like Mermaid 12: ELK (with its `elk:` options, set in a Layout panel) or dagre, with Mermaid's themes,
  looks and edge curves.
- Styling without syntax: color swatches, shape and curve pickers, style classes (`classDef`) to create, edit,
  apply and drag onto elements, and ready-made palettes. Several selected elements are edited at once.
- Canvas tools in a dock, a context menu on every element, drag to move elements into subgraphs, Ctrl+G to group
  the selection, and a + near a free side of a node to add a linked node.
- Every Mermaid diagram type opens: swimlanes, state diagrams and use case diagrams on the canvas; trees in an
  outline editor; data diagrams in a table; the rest as Mermaid's own drawing.
- A gallery with examples of every diagram type, grouped into families, with search and filters.
- A code editor with highlighting, completion, error marks, adjustable text size, and a syntax reference for every
  diagram type (a Syntax panel, tooltips on hover, and an optional highlight of the syntax at the cursor).
- Undo and redo across code and canvas, smart paste of Markdown code fences, diagrams saved in the browser, and
  links that carry the diagram in the URL.
- A Settings dialog (theme, code font size, line wrapping, syntax tooltips and highlighting, gallery preview
  size), kept in the browser.
- Deployed to GitHub Pages; `just deploy` runs the deployment by hand.
