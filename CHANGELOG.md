# Release notes

What changed in each version of Merbutler. The version is the one in `package.json`; the About dialog shows
these notes. New changes go under **Unreleased** until the next version gets its number and date.

## Unreleased

- **Go to code** in the canvas menu of a node, subgraph or edge: selects the line that writes it in the code (a
  node's definition, the `subgraph` line, the edge's own line) and scrolls to it. Code opens if it is closed.
- **Node** in the dock opens a menu of every shape, by group and with a search, like the Shape picker of the Node
  panel; the new node gets the shape you pick. (State diagrams still add a state at once.)
- The dock adds images and text after nodes: **Image** adds an image node (`@{ img }`) with Mermaid's placeholder
  image, and its panel opens to put in your image's URL; **Text** adds a text block without a box
  (`@{ shape: text }`). Flowcharts and swimlanes.
- A text block's label no longer wraps on the canvas: its box was a few pixels narrower than the label.
- A text block's Own style has no Fill: it has no box. It keeps the border (color, width, style), which Mermaid
  draws when the style sets a stroke color or width, and the canvas now draws it too.
- An image node takes no class and no style: its panel has neither, and a class put on a selection or dropped on
  it from the dock leaves it as it is.
- The Diagram panel picks the layout engine by what it does, as two choices instead of a list: **Hierarchical**
  (dagre) arranges nodes in ordered levels following their hierarchy; **Adaptive** (ELK, the default) rearranges
  nodes based on their context to keep the diagram organized.
- Code from layout leaves subgraphs in a line to Mermaid when the link between them goes into one of them (with
  ELK they came apart).
- The Subgraph field of the Node panel shows the subgraph a node is in, not the invisible group Code from layout
  put it in, and does not offer those groups.

## 0.4.0 — 2026-11-15

- Code from layout (dock, with the free layout on): nodes lined up in a row or a column go into an invisible
  subgraph (`row1`, `col1`, class `layoutAlign`) with the direction of the line, and neighbors not linked yet get
  an invisible link (`~~~`), so Mermaid's own layout keeps them lined up, with dagre and with ELK. Again after
  moving nodes, the groups and their invisible links are made anew from the drawing; clicking with nothing changed
  changes nothing. Only lines with no links to the rest of the diagram are grouped: Mermaid ignores the direction
  of a subgraph linked to the outside, and there the groups did not help or pulled nodes apart. The
  groups cannot be selected, moved or dropped into, and are not offered in "Move to subgraph". A group you link
  to, collapse or that sits in a collapsed subgraph is kept as yours. Each click says what it did, for example
  "Grouped 1 row and 1 column, with 2 invisible links. 1 line was left to Mermaid: its nodes link to other
  nodes." (or "Already up to date", "Nothing lined up to group"), and outlines the groups for a moment.
- Free layout: a dragged node snaps into line with another one (centers across or down, within 8 pixels on the
  screen), and a guide line shows the line. Hold Alt to drag without snapping. Rows and columns are then exactly
  straight, so Code from layout finds them.
- Own style: the Fill and Text rows offer the same color swatches as the Border row. The Classes panel keeps pale
  fills and deep text colors.
- A new diagram starts left to right (`flowchart LR`) instead of top to bottom.
- In a short window, Code keeps at least a few lines: Explorer and Gallery shrink and scroll inside first.

## 0.3.0 — 2026-11-15

- The Gallery moves to the bottom of the sidebar: every diagram type by family, each with a small preview, a dot for
  how the app edits it and its number of examples. A click opens the gallery at that type; the type on show is
  marked, and a click on it, on its family or on the Gallery header closes the gallery. The list of types on the
  left of a type's page is gone. The gallery opens over the canvas only, so the sidebar stays in view.
- A quieter header: Settings as a gear, and About opens from the version next to the name (the About button is
  gone).
- A slim toolbar under the Code header: the diagram's name on the left (moved from the app header), with a green
  check when saved or an orange dot when not; undo, redo, Paste, Copy and the text size on the right, as icons
  (moved from the app header and from a bar under the editor). Copy shows a check when done; a double click on the
  size gives back the default.

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
