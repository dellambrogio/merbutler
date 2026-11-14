/**
 * Example diagrams for the gallery: one per feature of the Mermaid flowchart syntax
 * (https://mermaid.js.org/syntax/flowchart.html), then every example of Mermaid's "All Diagram
 * Examples" page, by type. The gallery shows Mermaid's own rendering of each example, and whether
 * the visual editor supports it.
 */
import { MERMAID_EXAMPLES } from './mermaidExamples';

export interface GalleryExample {
  id: string;
  title: string;
  code: string;
  /**
   * A feature that the parser accepts but a canvas edit drops or does not show.
   * Shown on the card so the gallery does not overstate support. Remove it once the
   * feature is kept (see the "silent loss" part of the plan).
   */
  caveat?: string;
  /** Something the canvas keeps in the code but does not draw (yet). Not a loss. */
  note?: string;
}

export interface GalleryGroup {
  title: string;
  /** The part of the gallery the group is in. */
  part: 'Flowchart syntax' | 'Mermaid examples';
  examples: GalleryExample[];
}

/** A small inline image, so the gallery loads nothing from the network. */
const IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Ccircle cx='5' cy='5' r='4' fill='%233b6ef5'/%3E%3C/svg%3E";

const fc = (body: string, direction = 'LR'): string => `flowchart ${direction}\n${body.replace(/^\n/, '')}`;

/** The expanded shapes (`A@{ shape: … }`, Mermaid 11.3+), by their short names. */
const EXPANDED_SHAPES: Array<[string, string]> = [
  ['bang', 'Bang'],
  ['browser', 'Browser'],
  ['bucket', 'Bucket'],
  ['notch-rect', 'Card'],
  ['cloud', 'Cloud'],
  ['hourglass', 'Collate'],
  ['bolt', 'Com link'],
  ['brace', 'Comment'],
  ['brace-r', 'Comment right'],
  ['braces', 'Comment both'],
  ['console', 'Console'],
  ['lean-r', 'Lean right'],
  ['lean-l', 'Lean left'],
  ['datastore', 'Data store'],
  ['cyl', 'Database'],
  ['diam', 'Decision'],
  ['delay', 'Delay'],
  ['h-cyl', 'Direct access'],
  ['lin-cyl', 'Disk storage'],
  ['curv-trap', 'Display'],
  ['div-rect', 'Divided process'],
  ['doc', 'Document'],
  ['rounded', 'Event'],
  ['tri', 'Extract'],
  ['folder', 'Folder'],
  ['fork', 'Fork/join'],
  ['win-pane', 'Internal storage'],
  ['f-circ', 'Junction'],
  ['lin-doc', 'Lined document'],
  ['lin-rect', 'Lined process'],
  ['notch-pent', 'Loop limit'],
  ['flip-tri', 'Manual file'],
  ['sl-rect', 'Manual input'],
  ['trap-t', 'Manual operation'],
  ['docs', 'Multi-document'],
  ['st-rect', 'Multi-process'],
  ['odd', 'Odd'],
  ['flag', 'Paper tape'],
  ['person', 'Person'],
  ['hex', 'Prepare'],
  ['trap-b', 'Priority action'],
  ['rect', 'Process'],
  ['circle', 'Start'],
  ['sm-circ', 'Small start'],
  ['dbl-circ', 'Stop'],
  ['fr-circ', 'Framed stop'],
  ['bow-rect', 'Stored data'],
  ['fr-rect', 'Subprocess'],
  ['cross-circ', 'Summary'],
  ['tag-doc', 'Tagged document'],
  ['tag-rect', 'Tagged process'],
  ['stadium', 'Terminal'],
  ['text', 'Text block'],
];

const FLOWCHART_SYNTAX: Array<Omit<GalleryGroup, 'part'>> = [
  {
    title: 'Basics',
    examples: [
      {
        id: 'decision',
        title: 'Decision flow',
        code: fc(`
  A[Hard edge] -->|Link text| B(Round edge)
  B --> C{Decision}
  C -->|One| D[Result one]
  C -->|Two| E[Result two]
`),
      },
      { id: 'node-id', title: 'Node with only an id', code: fc('  id\n') },
      { id: 'node-text', title: 'Node with text', code: fc('  id1[This is the text in the box]\n') },
      { id: 'unicode', title: 'Unicode text', code: fc('  id["This ❤ Unicode"]\n') },
      { id: 'dir-td', title: 'Direction TD', code: fc('  Start --> Stop\n', 'TD') },
      { id: 'dir-bt', title: 'Direction BT', code: fc('  Start --> Stop\n', 'BT') },
      { id: 'dir-rl', title: 'Direction RL', code: fc('  Start --> Stop\n', 'RL') },
      { id: 'graph-keyword', title: '`graph` keyword', code: 'graph LR\n  A --> B\n' },
      { id: 'semicolons', title: 'Trailing semicolons', code: fc('  A --> B;\n  B --> C;\n') },
      { id: 'comments', title: 'Comments', code: fc('  %% this is a comment\n  A -- text --> B{node}\n') },
      { id: 'front-matter-title', title: 'Front matter title', code: '---\ntitle: Node\n---\nflowchart LR\n  id\n' },
    ],
  },
  {
    title: 'Classic shapes',
    examples: [
      {
        id: 'classic-shapes',
        title: 'All bracket shapes',
        code: fc(
          `
  a[rect] --- b(round) --- c([stadium]) --- d[[subroutine]] --- e[(cylinder)]
  f((circle)) --- g(((double))) --- h>flag] --- i{diamond} --- j{{hexagon}}
  k[/lean right/] --- l[\\lean left\\] --- m[/trapezoid\\] --- n[\\inv trapezoid/]
`,
          'TB',
        ),
      },
    ],
  },
  {
    title: 'Expanded shapes (@{ shape })',
    examples: [
            ...EXPANDED_SHAPES.map(([name, label]) => ({
        id: `shape-${name}`,
        title: `${label} (${name})`,
        code: fc(`  A@{ shape: ${name}, label: "${label}" }\n`),
      })),
      { id: 'shape-alias', title: 'Shape alias', code: fc('  A@{ shape: database, label: "Alias of cyl" }\n') },
    ],
  },
  {
    title: 'Special shapes',
    examples: [
      {
        id: 'icon-shape',
        title: 'Icon shape',
        note: 'FontAwesome (fa, fas, far, fab) is bundled; other icon sets show their name. Your Mermaid needs the icon pack registered.',
        code: fc('  A@{ icon: "fa:user", form: "square", label: "User Icon", pos: "t", h: 60 }\n'),
      },
      {
        id: 'image-shape',
        title: 'Image shape',
        code: fc(`  A@{ img: "${IMAGE}", label: "Image", pos: "t", h: 60, constraint: "on" }\n`),
      },
      {
        id: 'fontawesome',
        title: 'FontAwesome in labels',
        code: fc('  B["fa:fa-twitter for peace"] --> C[fa:fa-ban forbidden]\n  B --> D(fa:fa-spinner)\n  B --> E(A fab:fa-github perhaps?)\n', 'TD'),
        note: 'Your Mermaid needs the FontAwesome icon packs registered (or the FontAwesome CSS) to show these.',
      },
    ],
  },
  {
    title: 'Edges',
    examples: [
      {
        id: 'edge-strokes',
        title: 'Strokes and ends',
        code: fc('  A --> B\n  C --- D\n  E -.-> F\n  G ==> H\n  I --o J\n  K --x L\n', 'LR'),
      },
      { id: 'edge-both-ends', title: 'Both ends', code: fc('  A o--o B\n  B <--> C\n  C x--x D\n') },
      { id: 'edge-text', title: 'Text on edges', code: fc('  A-- This is the text! ---B\n  B---|This is the text|C\n  C-. text .-> D\n  D == text ==> E\n') },
      { id: 'edge-invisible', title: 'Invisible link', code: fc('  A ~~~ B\n') },
      { id: 'edge-chain', title: 'Chaining', code: fc('  A -- text --> B -- text2 --> C\n') },
      { id: 'edge-ampersand', title: 'Many-to-many with &', code: fc('  A & B --> C & D\n', 'TD') },
      { id: 'edge-length', title: 'Minimum link length', code: fc('  A --> B\n  B ---->|No| E[End]\n  B --> C --> D --> E\n', 'TD') },
      { id: 'edge-id', title: 'Edge ids', code: fc('  A e1@--> B\n') },
      { id: 'edge-animate', title: 'Edge animation', code: fc('  A e1@==> B\n  e1@{ animate: true }\n'), },
      { id: 'edge-animation-speed', title: 'Animation speed', code: fc('  A e1@--> B\n  e1@{ animation: slow }\n'), },
      { id: 'edge-step', title: 'Step-by-step flow', code: fc('  Client e1@--> API e2@--> Cache\n  e1@{ step: 1 }\n  e2@{ step: 2 }\n'), note: 'The canvas shows the step numbers; it does not play the flow.' },
      { id: 'edge-curve', title: 'Curve per edge', code: fc('  A e1@==> B\n  A e2@--> C\n  e1@{ curve: linear }\n  e2@{ curve: natural }\n'), note: 'The canvas draws linear and step curves; smooth ones use its own curve.' },
      { id: 'diagram-curve', title: 'Curve for the diagram', code: '---\nconfig:\n  flowchart:\n    curve: stepBefore\n---\nflowchart LR\n  A --> B\n  A --> C\n' },
    ],
  },
  {
    title: 'Text',
    examples: [
      { id: 'special-chars', title: 'Quoted special characters', code: fc('  id1["This is the (text) in the box"]\n') },
      { id: 'entities', title: 'Entity codes', code: fc('  A["A double quote:#quot;"] --> B["A dec char:#9829;"]\n') },
      { id: 'line-breaks', title: 'Line breaks', code: fc('  A["First line<br>second line"]\n') },
      {
        id: 'markdown',
        title: 'Markdown strings',
        code: fc('  a("`The **cat**\n  in the *hat*`") -- "`**bold** edge`" --> b\n'),
      },
    ],
  },
  {
    title: 'Subgraphs',
    examples: [
      {
        id: 'subgraphs',
        title: 'Subgraphs',
        code: fc(
          `
  c1-->a2
  subgraph one
    a1-->a2
  end
  subgraph two
    b1-->b2
  end
`,
          'TB',
        ),
      },
      { id: 'subgraph-id', title: 'Subgraph with id', code: fc('  subgraph ide1 [one]\n    a1 --> a2\n  end\n', 'TB') },
      {
        id: 'subgraph-edges',
        title: 'Edges to subgraphs',
        code: fc('  subgraph one\n    a1\n  end\n  subgraph two\n    b1\n  end\n  one --> two\n', 'TB'),
      },
      {
        id: 'subgraph-direction',
        title: 'Direction in subgraphs',
        code: fc('  subgraph TOP\n    direction TB\n    subgraph B1\n      direction RL\n      i1 --> f1\n    end\n  end\n  A --> TOP\n'),
      },
      {
        id: 'subgraph-collapsed',
        title: 'Collapsed subgraph',
        code: fc('  subgraph one [My Group]\n    a1 --> a2\n  end\n  x --> a1\n  one@{ view: collapsed }\n'),
      },
    ],
  },
  {
    title: 'Styling',
    examples: [
      { id: 'style', title: 'style', code: fc('  id1(Start)-->id2(Stop)\n  style id1 fill:#f9f,stroke:#333,stroke-width:4px\n') },
      { id: 'classdef', title: 'classDef and class', code: fc('  A --> B\n  classDef hot fill:#f96,stroke:#333\n  class A hot\n') },
      { id: 'class-shorthand', title: ':::class shorthand', code: fc('  A:::hot --> B\n  classDef hot fill:#f96\n'), note: 'Canvas edits write it as a class statement.' },
      { id: 'class-default', title: 'Default class', code: fc('  A --> B\n  classDef default fill:#f9f,stroke:#333\n') },
      { id: 'linkstyle', title: 'linkStyle', code: fc('  A --> B --> C\n  linkStyle 1 stroke:#ff3,stroke-width:4px,color:red\n') },
      { id: 'edge-class', title: 'Class on an edge', code: fc('  A e1@--> B\n  classDef animate stroke-dasharray: 9\\,5,animation: dash 25s linear infinite\n  class e1 animate\n'), note: 'Kept in the code. The canvas draws the dashes, not the animation.' },
    ],
  },
  {
    title: 'Interaction',
    examples: [
      { id: 'click-link', title: 'click with a link', code: fc('  A --> B\n  click B "https://mermaid.js.org" "Open the docs" _blank\n'), note: 'Kept as written. The canvas shows a badge and never follows the link.' },
      { id: 'click-callback', title: 'click with a callback', code: fc('  A --> B\n  click A callback "Tooltip"\n'), note: 'Kept as written. The canvas shows a badge and never runs the callback.' },
    ],
  },
  {
    title: 'Configuration',
    examples: [
      {
        id: 'config-look',
        title: 'Classic look and dagre',
        code: '---\nconfig:\n  theme: default\n  look: classic\n  layout: dagre\n---\nflowchart LR\n  A --> B --> C\n',
      },
    ],
  },
];

/** The page's sections as groups. Ids are `ex-<section>-<example>`, so they never clash with the syntax examples. */
const PAGE_EXAMPLES: GalleryGroup[] = MERMAID_EXAMPLES.map((section) => ({
  title: section.title,
  part: 'Mermaid examples',
  examples: section.examples.map((ex) => ({ id: `ex-${section.id}-${ex.id}`, title: ex.title, code: ex.code })),
}));

export const GALLERY: GalleryGroup[] = [...FLOWCHART_SYNTAX.map((g) => ({ ...g, part: 'Flowchart syntax' as const })), ...PAGE_EXAMPLES];
