/**
 * A syntax reference for every Mermaid diagram type, shipped with the app (works offline). Each
 * entry shows one construct, says what it does, and lists the tokens (keywords, arrows, brackets)
 * that bring it up when the cursor is on them or they are selected in the code editor (lookup.ts).
 *
 * Written for Mermaid 12.3. The newer `-beta` types follow Mermaid's own examples (see
 * gallery/mermaidExamples.ts); `tests/syntax.test.ts` checks that the snippets marked `full` parse.
 */

/** A token is matched as written (case-insensitive fallback), or by a pattern. */
export type Token = string | RegExp;

export interface SyntaxEntry {
  /** The construct, as code. Placeholders are plain words. */
  syntax: string;
  /** What it does, in one or two sentences. Inline `code` is marked with backticks. */
  text: string;
  tokens: readonly Token[];
}

export interface SyntaxSection {
  title: string;
  entries: readonly SyntaxEntry[];
}

export interface SyntaxDoc {
  /** The gallery type's slug (gallery.ts), so the gallery page shows the same reference. */
  id: string;
  title: string;
  /** DiagramType names (core/diagramTypes.ts) this reference covers. */
  types: readonly string[];
  /** Mermaid's own page for the type, when it has a known address. */
  url?: string;
  intro: string;
  sections: readonly SyntaxSection[];
}

const e = (syntax: string, text: string, ...tokens: Token[]): SyntaxEntry => ({ syntax, text, tokens });
const s = (title: string, ...entries: SyntaxEntry[]): SyntaxSection => ({ title, entries });

const DOCS_BASE = 'https://mermaid.js.org/syntax/';

/** What every diagram can have: front matter, comments, accessibility. Added at the end of each reference. */
export const COMMON: SyntaxSection = s(
  'Every diagram',
  e('---\ntitle: My diagram\nconfig:\n  theme: forest\n---', 'Front matter: YAML between `---` lines, before the header. `title` is drawn above the diagram; `config` sets Mermaid options.', '---', 'config'),
  e('config:\n  theme: default', 'Color theme: `default`, `neutral`, `dark`, `forest`, or `base` (with `themeVariables` to set your own colors).', 'theme', 'themeVariables', 'neutral', 'forest', 'base'),
  e('config:\n  look: handDrawn', 'Drawing style: `classic` or `handDrawn` (sketchy lines).', 'look', 'handDrawn', 'classic'),
  e('config:\n  layout: elk', 'Layout engine for graph-like diagrams: `dagre` (the default) or `elk`.', 'layout', 'elk', 'dagre'),
  e('%% a comment', 'A comment: the rest of the line is ignored. It must start the line.', '%%'),
  e('%%{init: {"theme": "dark"}}%%', 'A directive: the older way to set config inside the code. Front matter is preferred.', '%%{', '}%%', 'init'),
  e('accTitle: Order flow\naccDescr: How an order moves', 'Accessible title and description, read by screen readers, not drawn. `accDescr { … }` spans several lines.', 'accTitle', 'accDescr'),
);

// ---------------------------------------------------------------------------------------------
// Flowchart (and swimlanes, which use the same nodes and edges)

const FLOW_NODES = s(
  'Nodes',
  e('A', 'A node whose id is its text, drawn as a rectangle.'),
  e('A[Text]', 'Rectangle. The id (`A`) is used in edges; the text is shown.', '[', ']'),
  e('A(Text)', 'Rounded rectangle.', '(', ')'),
  e('A([Text])', 'Stadium (pill).', '([', '])'),
  e('A[[Text]]', 'Subroutine (double-sided rectangle).', '[[', ']]'),
  e('A[(Text)]', 'Cylinder (database).', '[(', ')]'),
  e('A((Text))', 'Circle.', '((', '))'),
  e('A(((Text)))', 'Double circle.', '(((', ')))'),
  e('A>Text]', 'Asymmetric (flag) shape.', '>'),
  e('A{Text}', 'Rhombus (decision).', '{', '}'),
  e('A{{Text}}', 'Hexagon.', '{{', '}}'),
  e('A[/Text/]', 'Parallelogram (input/output).', '[/', '/]'),
  e('A[\\Text\\]', 'Parallelogram leaning the other way.', '[\\', '\\]'),
  e('A[/Text\\]', 'Trapezoid.', '[/', '\\]'),
  e('A[\\Text/]', 'Upside-down trapezoid.', '[\\', '/]'),
  e('A@{ shape: cyl, label: "Orders" }', 'Expanded node syntax: any of the 50+ named shapes (`rect`, `diam`, `cyl`, `doc`, `cloud`, `hourglass`, …) with a label.', '@{', 'shape', 'label'),
  e('A@{ icon: "fa:user", form: "circle", label: "User", pos: "b", h: 60 }', 'Icon node: an icon from a registered pack. `form` is `square`, `circle` or `rounded`; `pos` puts the label at the top (`t`) or bottom (`b`).', 'icon', 'form', 'pos'),
  e('A@{ img: "https://…/logo.png", label: "Logo", w: 60, h: 60, constraint: "on" }', 'Image node. `constraint: "on"` keeps the image\'s aspect ratio.', 'img', 'constraint'),
  e('A["Text with (brackets) and #quot;quotes#quot;"]', 'Quote a label to use brackets or other symbols in it. `#quot;`, `#35;` and other entity codes write characters that cannot be typed.', '#quot;'),
  e('A["`**bold**, *italic*\nand a new line`"]', 'Markdown string: backticks inside the quotes allow **bold**, *italic* and line breaks that wrap automatically.', '`', '"`', '`"'),
  e('A[Line one<br/>line two]', 'A line break in a label.', '<br/>', '<br>', 'br'),
);

const FLOW_EDGES = s(
  'Edges',
  e('A --> B', 'Arrow. More dashes (`--->`) make the edge longer.', /^-{2,}>$/),
  e('A --- B', 'Line without an arrow head.', /^-{3,}$/),
  e('A -- text --> B\nA -->|text| B', 'Edge with a label, in either form.', '--', '-->|', '|', '---|'),
  e('A -.-> B\nA -. text .-> B', 'Dotted arrow (`-.-` without a head). More dots make it longer.', /^-\.+->?$/, '-.', '.->', '.-'),
  e('A ==> B\nA == text ==> B', 'Thick arrow (`===` without a head).', /^={2,}>?$/),
  e('A ~~~ B', 'Invisible link: places nodes without drawing an edge.', /^~{3,}$/),
  e('A --o B\nA --x B', 'Edge ending in a circle (`o`) or a cross (`x`).', '--o', '--x', 'o', 'x'),
  e('A <--> B\nA o--o B\nA x--x B', 'Heads on both ends.', '<-->', 'o--o', 'x--x', '<-.->', '<==>', '<'),
  e('A --> B & C --> D', '`&` connects several nodes at once; edges can also be chained on one line.', '&'),
  e('A e1@--> B\ne1@{ animate: true }', 'Edge id (`e1@`), then edge data: `animate: true`, `animation: fast|slow`, `curve: linear|basis|step|…`.', '@', '@-->', 'animate', 'animation', 'curve'),
  e('linkStyle 0 stroke:#f66,stroke-width:2px\nlinkStyle default stroke:#999', 'Styles edges by their position in the code (0 is the first), several as `0,2`, or all with `default`.', 'linkStyle', 'default'),
);

const FLOW_GROUPS = s(
  'Subgraphs',
  e('subgraph id [Title]\n  A --> B\nend', 'Groups nodes in a titled box. Edges can go to and from the subgraph id. `end` closes it.', 'subgraph', 'end'),
  e('subgraph one\n  direction LR\n  A --> B\nend', 'A subgraph\'s own direction (ignored when one of its nodes links outside it).', 'direction'),
);

const FLOW_STYLE = s(
  'Styling',
  e('classDef hot fill:#f96,stroke:#333,stroke-width:2px', 'Defines a style class. `classDef default …` styles every node without a class.', 'classDef', 'default'),
  e('class A,B hot', 'Applies a class to nodes.', 'class'),
  e('A:::hot --> B', 'Applies a class where the node is written.', ':::'),
  e('style A fill:#bbf,stroke:#f66,color:#fff', 'Styles one node. Properties: `fill`, `stroke`, `stroke-width`, `stroke-dasharray`, `color`, `font-weight`, …', 'style', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'color'),
);

const FLOW_INTERACTION = s(
  'Interaction',
  e('click A "https://example.com" "Tooltip" _blank', 'Makes a node a link. Targets: `_self`, `_blank`, `_parent`, `_top`.', 'click', 'href', '_blank', '_self', '_parent', '_top'),
  e('click A callback "Tooltip"\nclick A call callback(arg)', 'Calls a JavaScript function (only with a loose security level; the app draws with a strict one).', 'call', 'callback'),
);

const FLOWCHART: SyntaxDoc = {
  id: 'flowchart',
  title: 'Flowchart',
  types: ['Flowchart'],
  url: `${DOCS_BASE}flowchart.html`,
  intro: 'Nodes joined by edges, laid out in one direction.',
  sections: [
    s(
      'Header',
      e('flowchart LR', 'Starts a flowchart. Directions: `TB` or `TD` (top to bottom), `BT`, `LR` (left to right), `RL`. `graph` is the older keyword.', 'flowchart', 'graph', 'flowchart-elk', 'TB', 'TD', 'BT', 'LR', 'RL'),
    ),
    FLOW_NODES,
    FLOW_EDGES,
    FLOW_GROUPS,
    FLOW_STYLE,
    FLOW_INTERACTION,
  ],
};

const SWIMLANE: SyntaxDoc = {
  id: 'swimlane-diagram',
  title: 'Swimlane',
  types: ['Swimlane'],
  intro: 'A flowchart whose top-level subgraphs are drawn as lanes.',
  sections: [
    s(
      'Lanes',
      e('swimlane-beta LR', 'Starts a swimlane diagram; `LR` lanes are rows, `TB` lanes are columns.', 'swimlane-beta', 'LR', 'TB', 'TD', 'RL', 'BT'),
      e('subgraph Finance\n  audit[Audit]\nend\nsubgraph editors [Editors]\n  ok{Ready?}\nend', 'Each top-level subgraph is a lane, with an optional title in brackets. `end` closes it.', 'subgraph', 'end'),
    ),
    FLOW_NODES,
    FLOW_EDGES,
    FLOW_STYLE,
  ],
};

// ---------------------------------------------------------------------------------------------

const SEQUENCE: SyntaxDoc = {
  id: 'sequence-diagram',
  title: 'Sequence diagram',
  types: ['Sequence diagram'],
  url: `${DOCS_BASE}sequenceDiagram.html`,
  intro: 'Messages between participants, in time order from top to bottom.',
  sections: [
    s(
      'Participants',
      e('sequenceDiagram', 'Starts a sequence diagram.', 'sequenceDiagram'),
      e('participant A\nparticipant A as Alice', 'Declares a participant (a box), optionally with a display name. Undeclared participants appear in order of use.', 'participant', 'as'),
      e('actor U as User', 'A participant drawn as a stick figure.', 'actor'),
      e('participant DB@{ "type": "database" }', 'Participant shape: `boundary`, `control`, `entity`, `database`, `collections` or `queue`.', '@{', 'type', 'database', 'boundary', 'control', 'entity', 'collections', 'queue'),
      e('box Aqua Backend\n  participant API\n  participant DB\nend', 'Groups participants in a colored box.', 'box'),
      e('create participant C\nA->>C: Hello\ndestroy C', 'Creates a participant at a message, or ends its lifeline.', 'create', 'destroy'),
    ),
    s(
      'Messages',
      e('A->>B: Text', 'Solid line with an arrow head.', '->>'),
      e('A-->>B: Text', 'Dotted line with an arrow head (a reply).', '-->>'),
      e('A->B: Text\nA-->B: Text', 'Solid or dotted line without a head.', '->', '-->'),
      e('A<<->>B: Text\nA<<-->>B: Text', 'Arrow heads on both ends, solid or dotted.', '<<->>', '<<-->>'),
      e('A-xB: Text\nA--xB: Text', 'Line ending in a cross (a lost message).', '-x', '--x', 'x'),
      e('A-)B: Text\nA--)B: Text', 'Open arrow: an asynchronous message.', '-)', '--)'),
      e('A->>+B: Request\nB-->>-A: Response', '`+` activates the target, `-` deactivates the sender (shorthand for activate/deactivate).', '+', '-', '->>+', '-->>-', '->>-', '-->>+'),
      e('activate B\ndeactivate B', 'Shows or ends an activation bar on a lifeline.', 'activate', 'deactivate'),
      e('autonumber', 'Numbers every message.', 'autonumber'),
    ),
    s(
      'Notes and blocks',
      e('Note right of A: Text\nNote over A,B: Text', 'A note beside (`left of`, `right of`) or over one or two participants.', 'note', 'Note', 'over', 'left', 'right', 'of'),
      e('loop Every minute\n  A->>B: Ping\nend', 'A loop box. `end` closes every block.', 'loop', 'end'),
      e('alt Success\n  A->>B: OK\nelse Failure\n  A->>B: Error\nend', 'Alternatives; `else` starts the next branch.', 'alt', 'else'),
      e('opt Optional\n  A->>B: Maybe\nend', 'An optional part.', 'opt'),
      e('par Send email\n  A->>B: Mail\nand Send SMS\n  A->>C: SMS\nend', 'Parallel parts, separated by `and`.', 'par', 'and'),
      e('critical Connect\n  A->>DB: Open\noption Timeout\n  A->>A: Retry\nend', 'A critical region with optional outcomes.', 'critical', 'option'),
      e('break When the card is refused\n  A->>B: Stop\nend', 'Stops the sequence (an exception).', 'break'),
      e('rect rgb(200, 220, 255)\n  A->>B: Text\nend', 'A colored background behind messages.', 'rect', 'rgb', 'rgba'),
    ),
    s(
      'Other',
      e('title Checkout', 'A title above the diagram.', 'title'),
      e('link A: Dashboard @ https://example.com\nlinks A: {"Docs": "https://example.com"}', 'Menu links on a participant.', 'link', 'links'),
    ),
  ],
};

const CLASS: SyntaxDoc = {
  id: 'class-diagram',
  title: 'Class diagram',
  types: ['Class diagram'],
  url: `${DOCS_BASE}classDiagram.html`,
  intro: 'Classes with their members, and the relations between them.',
  sections: [
    s(
      'Classes',
      e('classDiagram', 'Starts a class diagram.', 'classDiagram', 'classDiagram-v2'),
      e('class Animal\nclass Animal["Living thing"]', 'Declares a class, optionally with a label.', 'class'),
      e('class Animal {\n  +String name\n  +eat(food) bool\n}', 'Members in a block: attributes, and methods with `()` and an optional return type.', '{', '}'),
      e('Animal : +int age\nAnimal : +sleep() void', 'Adds one member with a colon.', ':'),
      e('+ public  - private  # protected  ~ package', 'Visibility, written before a member name.', '+', '-', '#', '~'),
      e('+count()$  +draw()*', '`$` after a member: static; `*` after a method: abstract.', '$', '*', '()$', '()*'),
      e('class Box~T~\n+List~int~ items', 'Generic types between tildes.', '~'),
      e('class Shape {\n  <<interface>>\n}\n<<abstract>> Shape', 'Annotation: `<<interface>>`, `<<abstract>>`, `<<service>>`, `<<enumeration>>`.', '<<', '>>', 'interface', 'abstract', 'service', 'enumeration'),
      e('namespace Shop {\n  class Cart\n  class Order\n}', 'Groups classes.', 'namespace'),
    ),
    s(
      'Relations',
      e('Animal <|-- Dog', 'Inheritance.', '<|--', '--|>'),
      e('Car *-- Wheel', 'Composition (the part cannot exist alone).', '*--', '--*'),
      e('Team o-- Player', 'Aggregation.', 'o--', '--o'),
      e('Order --> Customer', 'Association.', '-->', '<--'),
      e('A -- B', 'Solid link.', '--'),
      e('Car ..> Engine', 'Dependency.', '..>', '<..'),
      e('Dog ..|> Pet', 'Realization (implements).', '..|>', '<|..'),
      e('A .. B', 'Dashed link.', '..'),
      e('Animal <|-- Dog : extends', 'A label after a colon.', ':'),
      e('Customer "1" --> "*" Order', 'Cardinality on each end: `1`, `0..1`, `1..*`, `*`, `n`, `0..n`, `1..n`.', '"1"', '"*"', '*'),
      e('Shape ()-- Circle', 'Lollipop interface.', '()--', '--()', '()'),
    ),
    s(
      'Notes, layout and style',
      e('note "A general note"\nnote for Dog "Barks"', 'A free note, or one attached to a class.', 'note', 'for'),
      e('direction RL', 'Layout direction: `TB`, `BT`, `LR`, `RL`.', 'direction', 'TB', 'BT', 'LR', 'RL'),
      e('classDef warm fill:#f96\ncssClass "Dog,Cat" warm\nclass Dog:::warm', 'Style classes: define, then apply with `cssClass`, `class … :::` or `:::` in a relation.', 'classDef', 'cssClass', ':::'),
      e('style Dog fill:#f9f,stroke:#333', 'Styles one class.', 'style'),
      e('click Dog href "https://example.com" "Tooltip"\nlink Dog "https://example.com"', 'Links on a class.', 'click', 'href', 'link', 'call', 'callback'),
    ),
  ],
};

const STATE: SyntaxDoc = {
  id: 'state-diagram',
  title: 'State diagram',
  types: ['State diagram'],
  url: `${DOCS_BASE}stateDiagram.html`,
  intro: 'States and the transitions between them.',
  sections: [
    s(
      'States',
      e('stateDiagram-v2', 'Starts a state diagram (`stateDiagram` is the older renderer).', 'stateDiagram-v2', 'stateDiagram'),
      e('Idle\nstate "Waiting for input" as Idle\nIdle : Waiting for input', 'A state, by id; a description with `state "…" as id` or after a colon.', 'state', 'as', ':'),
      e('[*] --> Idle\nDone --> [*]', 'Start (`[*]` before the arrow) and end (`[*]` after it).', '[*]'),
      e('state Active {\n  [*] --> Running\n  Running --> Paused\n}', 'Composite state: states nested in a block.', '{', '}'),
      e('state check <<choice>>\nstate split <<fork>>\nstate merge <<join>>', 'Pseudo-states: a choice (diamond), a fork or a join (bars).', '<<', '>>', 'choice', 'fork', 'join', '<<choice>>', '<<fork>>', '<<join>>'),
      e('state Active {\n  A --> B\n  --\n  C --> D\n}', 'Concurrent regions inside a composite state, separated by `--`.', '--'),
    ),
    s(
      'Transitions',
      e('Idle --> Running\nIdle --> Running : start', 'A transition, with an optional label after the colon.', '-->'),
      e('note right of Idle : Text\nnote left of Idle\n  Several lines\nend note', 'A note beside a state, on one line or in a block that ends with `end note`.', 'note', 'left', 'right', 'of', 'end'),
      e('direction LR', 'Layout direction: `TB`, `BT`, `LR`, `RL`.', 'direction', 'TB', 'BT', 'LR', 'RL'),
    ),
    s(
      'Styling',
      e('classDef bad fill:#f00,color:white\nclass Error bad\nError:::bad --> Idle', 'Style classes: define, then apply with `class` or `:::`.', 'classDef', 'class', ':::'),
      e('style Idle fill:#bbf', 'Styles one state.', 'style'),
    ),
  ],
};

const ER: SyntaxDoc = {
  id: 'entity-relationship-diagram',
  title: 'Entity relationship diagram',
  types: ['Entity relationship diagram'],
  url: `${DOCS_BASE}entityRelationshipDiagram.html`,
  intro: 'Entities, their attributes, and the cardinality of the relations between them.',
  sections: [
    s(
      'Relations',
      e('erDiagram', 'Starts an entity relationship diagram.', 'erDiagram'),
      e('CUSTOMER ||--o{ ORDER : places', 'A relation: entity, cardinality on each side, line, entity, then a label after the colon (quote it when it has spaces).', /^(\|o|\|\||\}o|\}\||o\||o\{|\|\{)(--|\.\.)(o\||\|\||o\{|\|\{|\|o|\}o|\}\|)$/),
      e('|o  o|', 'Zero or one (left side / right side).', '|o', 'o|'),
      e('||  ||', 'Exactly one.', '||'),
      e('}o  o{', 'Zero or more.', '}o', 'o{'),
      e('}|  |{', 'One or more.', '}|', '|{'),
      e('--  ..', '`--` identifying relation (solid line); `..` non-identifying (dashed).', '--', '..'),
      e('PERSON only one to zero or more CAR : drives', 'Cardinality in words: `only one`, `zero or one`, `one or more`, `zero or more`, `1+`, `0+`; `to` (identifying) or `optionally to` (non-identifying).', 'to', 'optionally', 'only', 'one', 'zero', 'more', 'many'),
    ),
    s(
      'Entities',
      e('CUSTOMER {\n  string name\n  int id PK "the key"\n  int addressId FK\n  string email UK\n}', 'Attributes: type, name, optional key (`PK`, `FK`, `UK`, several as `PK, FK`) and a comment.', 'PK', 'FK', 'UK', '{', '}'),
      e('p[Person] {\n  string name\n}', 'An alias: the entity is drawn as `Person` and referred to as `p`.', '['),
      e('direction LR', 'Layout direction: `TB`, `BT`, `LR`, `RL`.', 'direction'),
      e('classDef pk fill:#f96\nclass CUSTOMER pk\nORDER:::pk\nstyle ORDER fill:#bbf', 'Style classes and direct styles.', 'classDef', 'class', ':::', 'style'),
      e('title Shop data', 'A title.', 'title'),
    ),
  ],
};

const JOURNEY: SyntaxDoc = {
  id: 'user-journey-diagram',
  title: 'User journey',
  types: ['User journey'],
  url: `${DOCS_BASE}userJourney.html`,
  intro: 'Tasks a user goes through, with how satisfied they are at each step.',
  sections: [
    s(
      'Syntax',
      e('journey', 'Starts a user journey.', 'journey'),
      e('title Buying a coffee', 'A title.', 'title'),
      e('section Ordering', 'Groups the following tasks.', 'section'),
      e('Choose a drink: 4: Me, Barista', 'A task: name, score from 1 (unhappy) to 5 (happy), and the actors, separated by colons.', ':'),
    ),
  ],
};

const GANTT: SyntaxDoc = {
  id: 'gantt-chart',
  title: 'Gantt chart',
  types: ['Gantt chart'],
  url: `${DOCS_BASE}gantt.html`,
  intro: 'Tasks on a timeline, by section.',
  sections: [
    s(
      'Setup',
      e('gantt', 'Starts a Gantt chart.', 'gantt'),
      e('title Release plan', 'A title.', 'title'),
      e('dateFormat YYYY-MM-DD', 'How dates are written in the tasks (Day.js tokens).', 'dateFormat'),
      e('axisFormat %d %b', 'How dates are shown on the axis (d3 time format).', 'axisFormat'),
      e('tickInterval 1week', 'Spacing of the axis ticks: a number and `millisecond`, `second`, `minute`, `hour`, `day`, `week` or `month`.', 'tickInterval'),
      e('excludes weekends\nexcludes 2024-12-25', 'Days not counted in durations. `weekend friday` makes Friday–Saturday the weekend.', 'excludes', 'includes', 'weekends', 'weekend', 'weekday'),
      e('todayMarker off\ntodayMarker stroke-width:3px,stroke:#f00', 'Hides or styles the line for today.', 'todayMarker'),
      e('inclusiveEndDates', 'End dates count the last day of a task.', 'inclusiveEndDates'),
      e('---\ndisplayMode: compact\n---', 'Compact mode (in front matter): several tasks on one row when they do not overlap.', 'displayMode', 'compact'),
    ),
    s(
      'Tasks',
      e('section Design', 'Groups the following tasks.', 'section'),
      e('Wireframes :w1, 2024-01-01, 5d', 'A task: name, then after a colon an optional id, a start date and a duration or end date.', ':'),
      e('Build :b1, after w1, 10d\nTest :until release', 'Starts after another task (`after id`, several ids allowed), or runs until another task starts.', 'after', 'until'),
      e('Ship :done, crit, s1, 2024-02-01, 2d', 'Tags before the id: `done`, `active`, `crit` (critical), `milestone`.', 'done', 'active', 'crit', 'milestone'),
      e('Launch :milestone, m1, 2024-03-01, 0d', 'A milestone: a diamond at a point in time.', 'milestone'),
      e('Code freeze :vert, v1, 2024-02-20, 0d', 'A vertical marker line across the chart.', 'vert'),
      e('click b1 href "https://example.com"\nclick b1 call showTask("b1")', 'Links or callbacks on a task.', 'click', 'href', 'call'),
    ),
  ],
};

const PIE: SyntaxDoc = {
  id: 'pie-chart',
  title: 'Pie chart',
  types: ['Pie chart'],
  url: `${DOCS_BASE}pie.html`,
  intro: 'Slices proportional to their values.',
  sections: [
    s(
      'Syntax',
      e('pie\npie showData', 'Starts a pie chart; `showData` writes the values in the legend.', 'pie', 'showData'),
      e('title Pets adopted', 'A title.', 'title'),
      e('"Dogs" : 386\n"Cats" : 85.5', 'A slice: a quoted label and a positive value.', ':'),
    ),
  ],
};

const QUADRANT: SyntaxDoc = {
  id: 'quadrant-chart',
  title: 'Quadrant chart',
  types: ['Quadrant chart'],
  url: `${DOCS_BASE}quadrantChart.html`,
  intro: 'Points on two axes from 0 to 1, split into four quadrants.',
  sections: [
    s(
      'Syntax',
      e('quadrantChart', 'Starts a quadrant chart.', 'quadrantChart'),
      e('title Reach and engagement', 'A title.', 'title'),
      e('x-axis Low reach --> High reach\ny-axis Low --> High', 'Axis labels at each end (or only the start).', 'x-axis', 'y-axis', '-->'),
      e('quadrant-1 Expand\nquadrant-2 Promote\nquadrant-3 Re-evaluate\nquadrant-4 Improve', 'Quadrant titles: 1 top right, 2 top left, 3 bottom left, 4 bottom right.', 'quadrant-1', 'quadrant-2', 'quadrant-3', 'quadrant-4'),
      e('Campaign A: [0.3, 0.6]', 'A point: name and `[x, y]`, both from 0 to 1.', ':', '['),
      e('Campaign B: [0.4, 0.3] radius: 12, color: #f30, stroke-color: #10f, stroke-width: 3px', 'Point style.', 'radius', 'color', 'stroke-color', 'stroke-width'),
      e('classDef big radius: 15, color: #f00\nCampaign C:::big: [0.7, 0.8]', 'Point style classes.', 'classDef', ':::'),
    ),
  ],
};

const REQUIREMENT: SyntaxDoc = {
  id: 'requirement-diagram',
  title: 'Requirement diagram',
  types: ['Requirement diagram'],
  url: `${DOCS_BASE}requirementDiagram.html`,
  intro: 'Requirements, the elements that meet them, and how they relate (SysML).',
  sections: [
    s(
      'Requirements and elements',
      e('requirementDiagram', 'Starts a requirement diagram.', 'requirementDiagram'),
      e('requirement login {\n  id: 1\n  text: "Users can log in"\n  risk: high\n  verifymethod: test\n}', 'A requirement. `risk`: `Low`, `Medium`, `High`. `verifymethod`: `Analysis`, `Inspection`, `Test`, `Demonstration`.', 'requirement', 'id', 'text', 'risk', 'verifymethod'),
      e('functionalRequirement  interfaceRequirement  performanceRequirement  physicalRequirement  designConstraint', 'Other requirement kinds, written instead of `requirement`.', 'functionalRequirement', 'interfaceRequirement', 'performanceRequirement', 'physicalRequirement', 'designConstraint'),
      e('element loginPage {\n  type: "web page"\n  docRef: "docs/login.md"\n}', 'An element: something that meets, tests or relates to requirements.', 'element', 'type', 'docRef', 'docref'),
    ),
    s(
      'Relations',
      e('loginPage - satisfies -> login\nlogin <- satisfies - loginPage', 'A relation, written either way. Kinds: `contains`, `copies`, `derives`, `satisfies`, `verifies`, `refines`, `traces`.', 'contains', 'copies', 'derives', 'satisfies', 'verifies', 'refines', 'traces', '->', '<-', '-'),
      e('direction LR', 'Layout direction: `TB`, `BT`, `LR`, `RL`.', 'direction'),
      e('classDef key fill:#f96\nclass login key\nlogin:::key\nstyle login fill:#bbf', 'Style classes and direct styles.', 'classDef', 'class', ':::', 'style'),
    ),
  ],
};

const GIT: SyntaxDoc = {
  id: 'git-graph',
  title: 'Git graph',
  types: ['Git graph'],
  url: `${DOCS_BASE}gitgraph.html`,
  intro: 'Commits, branches and merges, as in a Git history.',
  sections: [
    s(
      'Syntax',
      e('gitGraph\ngitGraph TB:', 'Starts a Git graph; `LR:` (the default), `TB:` or `BT:` sets the direction.', 'gitGraph', 'LR:', 'TB:', 'BT:'),
      e('commit\ncommit id: "fix-login"', 'A commit on the current branch, with an optional id.', 'commit', 'id'),
      e('commit tag: "v1.0"\ncommit type: HIGHLIGHT', 'A tag; a type: `NORMAL`, `REVERSE` (crossed) or `HIGHLIGHT` (filled).', 'tag', 'type', 'NORMAL', 'REVERSE', 'HIGHLIGHT'),
      e('branch feature\nbranch hotfix order: 1', 'Creates a branch from the current one and switches to it; `order` sets its row.', 'branch', 'order'),
      e('checkout main\nswitch main', 'Switches to an existing branch.', 'checkout', 'switch'),
      e('merge feature\nmerge feature id: "m1" tag: "v2" type: REVERSE', 'Merges a branch into the current one.', 'merge'),
      e('cherry-pick id: "fix-login"\ncherry-pick id: "m1" parent: "fix-login"', 'Copies a commit onto the current branch; a merge commit needs its `parent`.', 'cherry-pick', 'parent'),
    ),
  ],
};

const C4_ELEMENT = /^(Person|System|SystemDb|SystemQueue|Container|ContainerDb|ContainerQueue|Component|ComponentDb|ComponentQueue)(_Ext)?$/;

const C4: SyntaxDoc = {
  id: 'c4-diagram',
  title: 'C4 diagram',
  types: ['C4 diagram'],
  url: `${DOCS_BASE}c4.html`,
  intro: 'Software architecture in the C4 model: context, containers, components, deployment.',
  sections: [
    s(
      'Header',
      e('C4Context\nC4Container\nC4Component\nC4Dynamic\nC4Deployment', 'Starts a C4 diagram at that level.', 'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'),
      e('title Internet banking', 'A title.', 'title'),
    ),
    s(
      'Elements',
      e('Person(customer, "Customer", "A bank customer")', 'A person: alias, label, description. `Person_Ext` is outside the system.', C4_ELEMENT),
      e('System(bank, "Bank", "Handles accounts")\nSystemDb(db, "Mainframe")\nSystemQueue(q, "Events")', 'A software system, a database, a queue; `_Ext` variants are external.', C4_ELEMENT),
      e('Container(api, "API", "Node.js", "Serves the app")', 'A container: alias, label, technology, description. Also `ContainerDb`, `ContainerQueue`.', C4_ELEMENT),
      e('Component(auth, "Auth", "Express", "Checks tokens")', 'A component. Also `ComponentDb`, `ComponentQueue`.', C4_ELEMENT),
      e('System_Boundary(b1, "Bank") {\n  Container(api, "API")\n}', 'A boundary around elements: `Boundary`, `Enterprise_Boundary`, `System_Boundary`, `Container_Boundary`.', 'Boundary', 'Enterprise_Boundary', 'System_Boundary', 'Container_Boundary', '{', '}'),
      e('Deployment_Node(dc, "Data center", "Ubuntu") {\n  Container(api, "API")\n}', 'A deployment node (C4Deployment). Also `Node`, `Node_L`, `Node_R`.', 'Deployment_Node', 'Node', 'Node_L', 'Node_R'),
    ),
    s(
      'Relations and style',
      e('Rel(customer, bank, "Uses", "HTTPS")', 'A relation: from, to, label, optional technology. `BiRel` goes both ways.', 'Rel', 'BiRel'),
      e('Rel_U(a, b, "…")  Rel_D  Rel_L  Rel_R  Rel_Back', 'A relation that places the target up, down, left, right, or points back.', 'Rel_U', 'Rel_Up', 'Rel_D', 'Rel_Down', 'Rel_L', 'Rel_Left', 'Rel_R', 'Rel_Right', 'Rel_Back'),
      e('RelIndex(1, customer, bank, "Logs in")', 'A numbered relation (C4Dynamic).', 'RelIndex'),
      e('UpdateElementStyle(customer, $fontColor="red", $bgColor="grey", $borderColor="red")', 'Styles an element. Named arguments start with `$`.', 'UpdateElementStyle', '$'),
      e('UpdateRelStyle(customer, bank, $textColor="blue", $lineColor="blue", $offsetX="5", $offsetY="-10")', 'Styles a relation and moves its label.', 'UpdateRelStyle'),
      e('UpdateBoundaryStyle(b1, $bgColor="#eee")', 'Styles a boundary.', 'UpdateBoundaryStyle'),
      e('UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")', 'How many shapes and boundaries go in a row.', 'UpdateLayoutConfig'),
    ),
  ],
};

const MINDMAP: SyntaxDoc = {
  id: 'mindmap',
  title: 'Mindmap',
  types: ['Mindmap'],
  url: `${DOCS_BASE}mindmap.html`,
  intro: 'A tree of ideas around a root. Indentation sets the hierarchy.',
  sections: [
    s(
      'Syntax',
      e('mindmap\n  root((Trip))\n    Packing\n      Clothes\n    Tickets', 'Starts a mindmap. The first node is the root; each deeper indentation is a child of the line above.', 'mindmap', 'root'),
      e('id[Square]', 'Square node.', '[', ']'),
      e('id(Rounded)', 'Rounded square.', '(', ')'),
      e('id((Circle))', 'Circle.', '((', '))'),
      e('id))Bang((', 'Bang (explosion).', '))', '(('),
      e('id)Cloud(', 'Cloud.', ')', '('),
      e('id{{Hexagon}}', 'Hexagon.', '{{', '}}'),
      e('Plain text', 'No brackets: the default shape.'),
      e('Packing\n::icon(fa fa-suitcase)', 'An icon on the node above (Font Awesome or Material Design classes).', '::icon', 'icon', '::'),
      e('Urgent\n:::urgent large', 'CSS classes on the node above.', ':::'),
      e('id["`**Bold** and\nnew lines`"]', 'Markdown strings: bold, italic and line breaks.', '`', '"`'),
    ),
  ],
};

const TIMELINE: SyntaxDoc = {
  id: 'timeline-diagram',
  title: 'Timeline',
  types: ['Timeline'],
  url: `${DOCS_BASE}timeline.html`,
  intro: 'Events grouped by time period.',
  sections: [
    s(
      'Syntax',
      e('timeline', 'Starts a timeline.', 'timeline'),
      e('title History of the web', 'A title.', 'title'),
      e('1991 : First web page\n2004 : Social media : Web 2.0', 'A period and its events, separated by colons.', ':'),
      e('2007 : Smartphones\n     : App stores', 'More events of the same period, on the next lines starting with a colon.', ':'),
      e('section 2000s', 'Groups the following periods (same color).', 'section'),
    ),
  ],
};

const SANKEY: SyntaxDoc = {
  id: 'sankey-diagram',
  title: 'Sankey diagram',
  types: ['Sankey diagram'],
  url: `${DOCS_BASE}sankey.html`,
  intro: 'Flows between nodes, as wide as their values.',
  sections: [
    s(
      'Syntax',
      e('sankey-beta', 'Starts a Sankey diagram; the rest is CSV.', 'sankey-beta', 'sankey'),
      e('Solar,Grid,60\nGrid,Homes,45', 'A flow: source, target, value. Nodes are created by name.', ','),
      e('"Wind, offshore",Grid,30', 'Quote a name that has a comma; `""` is a quote inside it. Empty lines are allowed.', '"'),
    ),
  ],
};

const XY: SyntaxDoc = {
  id: 'xy-chart',
  title: 'XY chart',
  types: ['XY chart'],
  url: `${DOCS_BASE}xyChart.html`,
  intro: 'Bar and line charts on an x and a y axis.',
  sections: [
    s(
      'Syntax',
      e('xychart-beta\nxychart-beta horizontal', 'Starts an XY chart; `horizontal` swaps the axes.', 'xychart-beta', 'xychart', 'horizontal', 'vertical'),
      e('title "Sales"', 'A title.', 'title'),
      e('x-axis [jan, feb, mar]\nx-axis "Month" [jan, feb, mar]', 'Categories on the x axis, with an optional axis title.', 'x-axis', '['),
      e('x-axis "Year" 2000 --> 2024\ny-axis "Revenue" 0 --> 100', 'A numeric axis from a minimum to a maximum.', 'y-axis', '-->'),
      e('bar [5, 8, 3]\nline [4, 7, 6]', 'A bar or line series, one value per category.', 'bar', 'line'),
    ),
  ],
};

const BLOCK: SyntaxDoc = {
  id: 'block-diagram',
  title: 'Block diagram',
  types: ['Block diagram'],
  url: `${DOCS_BASE}block.html`,
  intro: 'Blocks in rows and columns that you place yourself.',
  sections: [
    s(
      'Blocks',
      e('block-beta\n  columns 3\n  a b c', 'Starts a block diagram; `columns` sets how many blocks fit in a row. Blocks on a line go left to right.', 'block-beta', 'block', 'columns'),
      e('a["Label"]:2', 'A block with a label, spanning 2 columns.', ':'),
      e('space\nspace:2', 'An empty cell (or several).', 'space'),
      e('block:group:2\n  x y\nend', 'A nested block (id `group`, 2 columns wide) with its own blocks. `end` closes it.', 'end'),
      e('a("Round")  b(("Circle"))  c[("Database")]  d{"Decision"}  e>"Flag"]', 'Shapes, as in flowcharts.', '(', '((', '[(', '{', '>'),
      e('arrow<["Next"]>(right)', 'A block arrow: `right`, `left`, `up`, `down`, `x` or `y` (both ways).', '<[', ']>', 'right', 'left', 'up', 'down'),
    ),
    s(
      'Edges and style',
      e('a --> b\na -- "label" --> b\na --- b', 'Edges between blocks, as in flowcharts.', '-->', '---', '--'),
      e('style a fill:#f96,stroke:#333\nclassDef warm fill:#f96\nclass a warm', 'Direct styles and style classes.', 'style', 'classDef', 'class'),
    ),
  ],
};

const PACKET: SyntaxDoc = {
  id: 'packet-diagram',
  title: 'Packet diagram',
  types: ['Packet diagram'],
  url: `${DOCS_BASE}packet.html`,
  intro: 'The fields of a network packet, by bit position.',
  sections: [
    s(
      'Syntax',
      e('packet', 'Starts a packet diagram (`packet-beta` also works).', 'packet', 'packet-beta'),
      e('title TCP header', 'A title.', 'title'),
      e('0-15: "Source port"\n16: "Flag"', 'A field over a range of bits, or one bit.', '-', ':'),
      e('+8: "Length"', 'A field of 8 bits after the previous one.', '+'),
    ),
  ],
};

const KANBAN: SyntaxDoc = {
  id: 'kanban-diagram',
  title: 'Kanban',
  types: ['Kanban'],
  url: `${DOCS_BASE}kanban.html`,
  intro: 'Columns of task cards. Indentation puts cards in columns.',
  sections: [
    s(
      'Syntax',
      e('kanban', 'Starts a Kanban board.', 'kanban'),
      e('todo[To do]\n  t1[Write the docs]', 'A column (not indented) and a card (indented under it). The id before the brackets is optional.', '[', ']'),
      e('t1[Fix login]@{ assigned: \'sam\', ticket: 42, priority: \'High\' }', 'Card data: `assigned`, `ticket`, `priority` (`Very High`, `High`, `Low`, `Very Low`).', '@{', 'assigned', 'ticket', 'priority'),
      e('---\nconfig:\n  kanban:\n    ticketBaseUrl: \'https://example.com/#TICKET#\'\n---', 'Links tickets: `#TICKET#` is replaced by the ticket number.', 'ticketBaseUrl', '#TICKET#'),
    ),
  ],
};

const ARCHITECTURE: SyntaxDoc = {
  id: 'architecture-diagram',
  title: 'Architecture diagram',
  types: ['Architecture diagram'],
  url: `${DOCS_BASE}architecture.html`,
  intro: 'Services and groups, as in cloud architecture drawings.',
  sections: [
    s(
      'Services and groups',
      e('architecture-beta', 'Starts an architecture diagram.', 'architecture-beta'),
      e('group api(cloud)[API]\ngroup inner(server)[Inner] in api', 'A group with an icon and a title, optionally inside another group.', 'group', 'in'),
      e('service db(database)[Database] in api', 'A service with an icon and a title. Icons: `cloud`, `database`, `disk`, `internet`, `server`, or `pack:name` from a registered pack (`logos:aws`).', 'service', 'cloud', 'database', 'disk', 'internet', 'server'),
      e('junction j1\njunction j2 in api', 'A junction: a point where edges split.', 'junction'),
    ),
    s(
      'Edges',
      e('db:R -- L:server', 'An edge from the right side of `db` to the left side of `server`. Sides: `T`, `B`, `L`, `R`.', '--', 'T', 'B', 'L', 'R', ':'),
      e('db:R --> L:server\ndb:R <--> L:server', 'Edges with arrow heads.', '-->', '<--', '<-->'),
      e('db{group}:R -- L:server', 'An edge that starts at the group the service is in.', '{group}', 'group'),
    ),
  ],
};

const RADAR: SyntaxDoc = {
  id: 'radar-diagram',
  title: 'Radar chart',
  types: ['Radar chart'],
  url: `${DOCS_BASE}radar.html`,
  intro: 'Values on axes around a center, one curve per series.',
  sections: [
    s(
      'Syntax',
      e('radar-beta', 'Starts a radar chart.', 'radar-beta'),
      e('title Skills', 'A title.', 'title'),
      e('axis a["Speed"], b["Power"], c["Range"]', 'Axes: an id and an optional label. Several `axis` lines add more.', 'axis'),
      e('curve x["Model X"]{3, 5, 4}\ncurve y{ a: 2, c: 5, b: 3 }', 'A curve: one value per axis, in order or by axis id.', 'curve', '{'),
      e('max 5\nmin 0\nticks 5', 'The value range and the number of rings.', 'max', 'min', 'ticks'),
      e('showLegend false\ngraticule polygon', 'Hides the legend; draws the grid as `circle` (default) or `polygon`.', 'showLegend', 'graticule', 'polygon', 'circle'),
    ),
  ],
};

const TREEMAP: SyntaxDoc = {
  id: 'treemap',
  title: 'Treemap',
  types: ['Treemap'],
  url: `${DOCS_BASE}treemap.html`,
  intro: 'Nested rectangles sized by value. Indentation sets the hierarchy.',
  sections: [
    s(
      'Syntax',
      e('treemap-beta', 'Starts a treemap.', 'treemap-beta', 'treemap'),
      e('"Travel"\n    "Flights": 900\n    "Trains": 140', 'A section (quoted name, no value) and its leaves (name: value), indented under it.', ':', '"'),
      e('"Travel":::big\nclassDef big fill:#fc9,stroke:#333;', 'A style class on a node.', ':::', 'classDef'),
      e('---\nconfig:\n  treemap:\n    valueFormat: \'$0,0\'\n---', 'How values are written (d3 format).', 'valueFormat'),
    ),
  ],
};

const TREEVIEW: SyntaxDoc = {
  id: 'treeview',
  title: 'TreeView',
  types: ['TreeView'],
  intro: 'A file and folder tree. Indentation sets the hierarchy.',
  sections: [
    s(
      'Syntax',
      e('treeView-beta\n    app/\n        main.ts\n    README.md', 'Starts a tree view. Each deeper indentation is a child of the line above; a trailing `/` marks a folder.', 'treeView-beta', '/'),
      e('"Holiday Photos"', 'Quote a name that has spaces.', '"'),
      e('server.ts ## starts the API', 'A comment shown next to the entry.', '##'),
      e('server.ts icon(logos:nodejs-icon)\ntheme.css icon(none)', 'An icon for the entry (`pack:name`), or none.', 'icon', 'icon('),
      e('server.ts :::highlight', 'A style class on the entry.', ':::'),
      e('---\nconfig:\n  treeView:\n    showIcons: true\n    defaultIconPack: material-icon-theme\n    filenameIcons:\n      Makefile: makefile\n    extensionIcons:\n      .ts: typescript\n---', 'Icons for every entry, by file name or extension.', 'showIcons', 'defaultIconPack', 'filenameIcons', 'extensionIcons'),
    ),
  ],
};

const USECASE: SyntaxDoc = {
  id: 'use-case-diagram',
  title: 'Use case diagram',
  types: ['Use case diagram'],
  intro: 'Actors, the use cases they take part in, and system boundaries.',
  sections: [
    s(
      'Elements',
      e('usecase-beta', 'Starts a use case diagram.', 'usecase-beta'),
      e('actor Client("Client")', 'An actor (stick figure), with an id and a label.', 'actor'),
      e('CheckBalance("Check balance")', 'A use case (ellipse).', '(', ')'),
      e('systemBoundary "Library"\n  Borrow("Borrow a book")\nend\nLibrary@{ type: package }', 'A system boundary around use cases; `type: package` draws it as a package. Its id is the name with `_` for spaces.', 'systemBoundary', 'end', '@{', 'type', 'package'),
      e('note for Borrow "Needs a library card"', 'A note on an actor or a use case.', 'note', 'for'),
      e('direction LR', 'Layout direction: `TB`, `BT`, `LR`, `RL`.', 'direction'),
    ),
    s(
      'Relations',
      e('Client --> CheckBalance\nClient -- "label" --> Transfer', 'Association, with an optional label. Also `--`, `--o`, `--x`, `<--`.', '-->', '--', '--o', '--x', '<--'),
      e('Checkout ..>:include Pay\nCheckout ..>:extend Coupon', 'Include and extend relations between use cases.', '..>', '..>:', 'include', 'extend'),
      e('Admin --|> User', 'Generalization.', '--|>'),
      e('classDef vip fill:#fc9\nclass Client vip\nstyle Client fill:#bbf', 'Style classes and direct styles.', 'classDef', 'class', 'style'),
    ),
  ],
};

const ISHIKAWA: SyntaxDoc = {
  id: 'ishikawa-diagram',
  title: 'Ishikawa diagram',
  types: ['Ishikawa diagram'],
  intro: 'A fishbone diagram: the causes of a problem, by category. Indentation sets the hierarchy.',
  sections: [
    s(
      'Syntax',
      e('ishikawa-beta\n    Slow website\n    Code\n        No caching\n        Large images', 'Starts the diagram. The first line is the problem (the head); the next lines at that indentation are categories (bones), and deeper lines are causes and sub-causes.', 'ishikawa-beta', 'ishikawa'),
    ),
  ],
};

const VENN: SyntaxDoc = {
  id: 'venn-diagram',
  title: 'Venn diagram',
  types: ['Venn diagram'],
  intro: 'Overlapping sets.',
  sections: [
    s(
      'Syntax',
      e('venn-beta', 'Starts a Venn diagram.', 'venn-beta'),
      e('title "Hobbies"', 'A title.', 'title'),
      e('set Fun\nset EN["English"]:20', 'A set: an id, an optional label and an optional size.', 'set'),
      e('union Fun,Cheap["Board games"]:6', 'The overlap of two or more sets, with an optional label and size.', 'union', ','),
      e('set EN["English"]\n    text en1["Sales"]', 'Text items inside a set or an overlap, indented under it.', 'text'),
      e('style EN fill:gold', 'Styles a set.', 'style'),
    ),
  ],
};

const EVENT_MODELING: SyntaxDoc = {
  id: 'event-modeling-diagram',
  title: 'Event modeling',
  types: ['Event modeling'],
  intro: 'An event model: screens, commands, events and read models in time order.',
  sections: [
    s(
      'Frames',
      e('eventmodeling', 'Starts an event model.', 'eventmodeling'),
      e('tf 01 ui BookingUI', 'A frame: number, kind, name. Kinds: `ui` (screen), `cmd` (command), `evt` (event), `rmo` (read model), `pcr` (processor).', 'tf', 'ui', 'cmd', 'evt', 'rmo', 'pcr'),
      e('rf 04 evt Carrier.ParcelScanned', 'Another kind of frame; Mermaid\'s example uses it for an event from an outside system, whose name the dotted prefix gives.', 'rf'),
      e('tf 04 rmo ReservationList ->> 03', 'Links the frame to an earlier frame by number.', '->>'),
    ),
    s(
      'Data',
      e('tf 02 cmd ShipOrder [[ShipOrder01]]', 'Attaches a data block to the frame.', '[[', ']]'),
      e('data ShipOrder01 {\n  orderId: \'A-1042\'\n  boxes: 3\n}', 'A data block: fields and example values or types.', 'data'),
    ),
  ],
};

const WARDLEY: SyntaxDoc = {
  id: 'wardley-maps',
  title: 'Wardley map',
  types: ['Wardley map'],
  intro: 'Components placed by visibility (up) and evolution (right), with their dependencies.',
  sections: [
    s(
      'Map',
      e('wardley-beta', 'Starts a Wardley map.', 'wardley-beta'),
      e('title Coffee shop\nsize [1100, 800]', 'A title, and the size of the drawing in pixels.', 'title', 'size'),
      e('evolution Idea -> Prototype -> Product -> Utility', 'Custom names for the four evolution stages.', 'evolution'),
    ),
    s(
      'Components',
      e('anchor Customer [0.95, 0.60]', 'An anchor (a user or need): `[visibility, evolution]`, both from 0 to 1.', 'anchor', '['),
      e('component Beans [0.62, 0.70]', 'A component at `[visibility, evolution]`.', 'component'),
      e('component Grinder [0.50, 0.55] label [-80, 4]', 'Moves the component\'s label by `[x, y]` pixels.', 'label'),
      e('Cup -> Beans', 'A dependency.', '->'),
      e('evolve Grinder 0.75', 'Shows that a component will evolve to that position.', 'evolve'),
      e('pipeline Light {\n  component Candle [0.20]\n  component LED [0.78]\n}', 'A pipeline: variants of a component at different evolutions.', 'pipeline', '{', '}'),
      e('deaccelerator Licensing [0.18, 0.60]', 'A force slowing evolution (an `accelerator` speeds it up).', 'deaccelerator', 'accelerator'),
    ),
    s(
      'Notes',
      e('note "Milk is a commodity" [0.42, 0.88]', 'A note at `[visibility, evolution]`.', 'note'),
      e('annotations [1, 0]\nannotation 1,[0.50, 0.15] "Changes often"', 'Numbered annotations, and where their list is drawn.', 'annotation', 'annotations'),
    ),
  ],
};

const CYNEFIN: SyntaxDoc = {
  id: 'cynefin-framework',
  title: 'Cynefin framework',
  types: ['Cynefin framework'],
  intro: 'Items sorted into the five Cynefin domains, with moves between domains.',
  sections: [
    s(
      'Syntax',
      e('cynefin-beta', 'Starts a Cynefin diagram.', 'cynefin-beta'),
      e('title Support triage', 'A title.', 'title'),
      e('complex\n  "Churn after the redesign"', 'A domain and its items (quoted, indented). Domains: `complex`, `complicated`, `clear`, `chaotic`, `confusion`.', 'complex', 'complicated', 'clear', 'chaotic', 'confusion'),
      e('complex --> complicated : "Cause found"', 'A move from one domain to another, with a label.', '-->', ':'),
    ),
  ],
};

const RAILROAD_IR: SyntaxDoc = {
  id: 'railroad-diagram-ir',
  title: 'Railroad diagram',
  types: ['Railroad diagram'],
  intro: 'Grammar rules drawn as railroad tracks, written with functions.',
  sections: [
    s(
      'Syntax',
      e('railroad-beta', 'Starts a railroad diagram.', 'railroad-beta'),
      e('title CSV grammar', 'A title.', 'title'),
      e('record = sequence(nonterminal("field"), terminal(",")) ;', 'A rule: a name, `=`, an expression, and `;`.', '=', ';'),
      e('terminal("or")\nnonterminal("atom")', 'A literal token (rounded), or a reference to another rule (boxed).', 'terminal', 'nonterminal'),
      e('sequence(a, b, c)\nchoice(a, b)', 'One after the other; one of several.', 'sequence', 'choice'),
      e('optional(a)\nzeroOrMore(a)\noneOrMore(a)', 'Skippable; repeated any number of times; repeated at least once.', 'optional', 'zeroOrMore', 'oneOrMore'),
    ),
  ],
};

const RAILROAD_EBNF: SyntaxDoc = {
  id: 'railroad-diagram-ebnf',
  title: 'Railroad diagram (EBNF)',
  types: ['Railroad diagram (EBNF)'],
  intro: 'Grammar rules in EBNF, drawn as railroad tracks.',
  sections: [
    s(
      'Syntax',
      e('railroad-ebnf-beta', 'Starts an EBNF railroad diagram.', 'railroad-ebnf-beta'),
      e('date = year "-" month ;', 'A rule: name, `=`, items in sequence, `;`. Quoted text is a terminal; a name is another rule.', '=', ';', '"'),
      e('a | b', 'A choice.', '|'),
      e('( a b )', 'A group.', '(', ')'),
      e('a?  a*  a+', 'Optional; zero or more; one or more.', '?', '*', '+', ')?', ')*', ')+'),
    ),
  ],
};

const RAILROAD_ABNF: SyntaxDoc = {
  id: 'railroad-diagram-abnf',
  title: 'Railroad diagram (ABNF)',
  types: ['Railroad diagram (ABNF)'],
  intro: 'Grammar rules in ABNF (the notation of the RFCs), drawn as railroad tracks.',
  sections: [
    s(
      'Syntax',
      e('railroad-abnf-beta', 'Starts an ABNF railroad diagram.', 'railroad-abnf-beta'),
      e('time = hour ":" minute ;', 'A rule: name, `=`, items in sequence, `;`.', '=', ';'),
      e('a / b', 'A choice.', '/'),
      e('[ ":" second ]', 'Optional.', '[', ']'),
      e('2DIGIT  1*ALPHA  *WSP', 'Repetition: exactly 2, at least 1, any number.', '*'),
      e('( a b )', 'A group.', '(', ')'),
    ),
  ],
};

const RAILROAD_PEG: SyntaxDoc = {
  id: 'railroad-diagram-peg',
  title: 'Railroad diagram (PEG)',
  types: ['Railroad diagram (PEG)'],
  intro: 'Grammar rules as a parsing expression grammar, drawn as railroad tracks.',
  sections: [
    s(
      'Syntax',
      e('railroad-peg-beta', 'Starts a PEG railroad diagram.', 'railroad-peg-beta'),
      e('List <- "[" Items? "]" ;', 'A rule: name, `<-`, items in sequence, `;`.', '<-', ';'),
      e('a / b', 'Ordered choice: the first that matches.', '/'),
      e('a?  a*  a+', 'Optional; zero or more; one or more.', '?', '*', '+', ')*', ')?', ')+'),
      e('!"0" Digit\n&Digit', 'Predicates: not followed by (`!`), followed by (`&`), without consuming.', '!', '&', '!"'),
    ),
  ],
};

/** Every reference, in the gallery's order of families. */
export const SYNTAX_DOCS: readonly SyntaxDoc[] = [
  FLOWCHART,
  SWIMLANE,
  STATE,
  USECASE,
  SEQUENCE,
  CLASS,
  ER,
  C4,
  ARCHITECTURE,
  BLOCK,
  REQUIREMENT,
  MINDMAP,
  TREEVIEW,
  TREEMAP,
  ISHIKAWA,
  KANBAN,
  PIE,
  XY,
  SANKEY,
  RADAR,
  QUADRANT,
  VENN,
  PACKET,
  GANTT,
  TIMELINE,
  JOURNEY,
  GIT,
  EVENT_MODELING,
  WARDLEY,
  CYNEFIN,
  RAILROAD_IR,
  RAILROAD_EBNF,
  RAILROAD_ABNF,
  RAILROAD_PEG,
];

/** The reference for a diagram type name (DiagramType.name), if there is one. */
export function docForType(typeName: string): SyntaxDoc | undefined {
  return SYNTAX_DOCS.find((d) => d.types.includes(typeName));
}

/** The reference for a gallery type id. */
export function docForGallery(id: string): SyntaxDoc | undefined {
  return SYNTAX_DOCS.find((d) => d.id === id);
}
