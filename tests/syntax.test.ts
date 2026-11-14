import { describe, expect, test } from 'vitest';
import { DIAGRAM_TYPES } from '../src/core/diagramTypes';
import { parse } from '../src/core/parse';
import { GALLERY_TYPES } from '../src/gallery/gallery';
import { docForCode, findEntries, selectionToken, tokensAt, typeNameOf } from '../src/syntax/lookup';
import { docForGallery, docForType, SYNTAX_DOCS } from '../src/syntax/syntaxDocs';

/** Where the cursor is: the `¦` in the line. */
const at = (marked: string): string[] => tokensAt(marked.replace('¦', ''), marked.indexOf('¦'));

/** The first entry's syntax for the token at the marked cursor, in a doc. */
function lookup(typeName: string, marked: string): string | undefined {
  return findEntries(docForType(typeName), at(marked))?.entries[0]?.syntax;
}

describe('syntax reference', () => {
  test('every gallery type and every diagram type with examples has a reference', () => {
    for (const t of GALLERY_TYPES) expect(docForGallery(t.id), t.id).toBeDefined();
    const without = DIAGRAM_TYPES.filter((t) => !docForType(t.name)).map((t) => t.name);
    expect(without).toEqual(['Agent flow', 'Info']);
    expect(new Set(SYNTAX_DOCS.map((d) => d.id)).size).toBe(SYNTAX_DOCS.length);
  });

  test('tokens at the cursor', () => {
    expect(at('  A -¦-> B')).toEqual(['-->']);
    expect(at('  A --¦o B')).toContain('--o');
    expect(at('x-ax¦is Low --> High')).toEqual(['x-axis']);
    expect(at('  participant¦ A')).toEqual(['participant']);
    expect(at('flowchart LR¦')).toEqual(['LR']);
    expect(at('   ¦   ')).toEqual([]);
    expect(selectionToken('  -.->  ')).toBe('-.->');
    expect(selectionToken('a\nb')).toBeNull();
  });

  test('finds the entry for a token', () => {
    expect(lookup('Flowchart', 'A -¦--> B')).toBe('A --> B');
    expect(lookup('Flowchart', 'A -.¦-> B')).toMatch(/^A -\.-> B/);
    expect(lookup('Flowchart', 'A ~¦~~ B')).toBe('A ~~~ B');
    expect(lookup('Flowchart', 'A --¦>|text| B')).toMatch(/-- text -->/);
    expect(lookup('Flowchart', 'A:¦::hot')).toMatch(/:::/);
    expect(lookup('Flowchart', '  sub¦graph one')).toMatch(/^subgraph/);
    expect(lookup('Flowchart', '%¦% note')).toBe('%% a comment');
    expect(lookup('Sequence diagram', 'A-¦>>B: Hi')).toBe('A->>B: Text');
    expect(lookup('Sequence diagram', 'A-->¦>B: Hi')).toBe('A-->>B: Text');
    expect(lookup('Sequence diagram', '  no¦te right of A: x')).toMatch(/^Note/);
    expect(lookup('Entity relationship diagram', 'A ||-¦-o{ B : has')).toMatch(/^CUSTOMER/);
    expect(lookup('C4 diagram', 'Person_E¦xt(a, "A")')).toMatch(/^Person/);
    expect(lookup('Gantt chart', 'Ship :cr¦it, 2024-01-01, 2d')).toMatch(/done, crit/);
    expect(lookup('Quadrant chart', 'quadrant¦-1 Grow')).toMatch(/^quadrant-1/);
  });

  test('finds the type of the code', () => {
    expect(typeNameOf('---\ntitle: x\n---\n%% c\nsequenceDiagram\n  A->>B: hi')).toBe('Sequence diagram');
    expect(typeNameOf('graph TD\n A')).toBe('Flowchart');
    expect(docForCode('nothing here')).toBeUndefined();
  });
});

/**
 * Code that uses what the reference documents, beyond the gallery's examples. Mermaid must accept
 * each one (as an editable diagram or a preview), so the reference does not teach wrong syntax.
 */
const DOCUMENTED: Record<string, string> = {
  flowchart: `flowchart LR
  A[Rect] --> B(Round) --- C([Stadium]) -.-> D[[Sub]] ==> E[(Db)] ~~~ F((Circle))
  F --o G>Flag] --x H{Rhombus} <--> I{{Hex}} -- text --> J[/Para/] -->|t| K[\\Alt\\]
  K -. text .-> L[/Trap\\] == text ==> M[\\Trap/] --> N(((Double)))
  N & M --> O@{ shape: cyl, label: "Orders" }
  P@{ icon: "fa:user", form: "circle", label: "User", pos: "b", h: 60 }
  Q["\`**bold** *it*\`"] e1@--> R
  e1@{ animate: true }
  subgraph S [Title]
    direction LR
    T:::hot
  end
  classDef hot fill:#f96
  class A hot
  style B fill:#bbf
  linkStyle 0 stroke:#f66
  linkStyle default stroke:#999
  click A "https://example.com" "Tip" _blank
`,
  sequence: `sequenceDiagram
  title Checkout
  autonumber
  participant A as Alice
  actor U as User
  participant DB@{ "type": "database" }
  box Aqua Backend
    participant API
  end
  A->>+API: one
  API-->>-A: two
  A->API: three
  A-->API: four
  A<<->>API: five
  A<<-->>API: six
  A-xAPI: seven
  A--xAPI: eight
  A-)API: nine
  A--)API: ten
  activate API
  deactivate API
  create participant C
  A->>C: hi
  destroy C
  C->>A: bye
  Note right of A: n
  Note over A,API: n
  loop Every minute
    A->>API: ping
  end
  alt ok
    A->>API: ok
  else bad
    A->>API: bad
  end
  opt maybe
    A->>API: m
  end
  par one
    A->>API: p
  and two
    A->>U: q
  end
  critical Connect
    A->>DB: open
  option Timeout
    A->>A: retry
  end
  break stop
    A->>API: s
  end
  rect rgb(200, 220, 255)
    A->>API: r
  end
  link A: Dashboard @ https://example.com
  links A: {"Docs": "https://example.com"}
`,
  class: `classDiagram
  direction RL
  class Animal["Living thing"] {
    <<abstract>>
    +String name
    -int age
    #eat(food) bool
    ~sleep()
    +count()$ int
    +draw()*
  }
  class Box~T~
  Animal : +int legs
  Animal <|-- Dog : extends
  Car *-- Wheel
  Team o-- Player
  Order --> Customer
  A -- B
  Car ..> Engine
  Dog ..|> Pet
  C .. D
  Customer "1" --> "*" Order
  Shape ()-- Circle
  namespace Shop {
    class Cart
  }
  note "general"
  note for Dog "Barks"
  classDef warm fill:#f96
  cssClass "Dog,Cat" warm
  style Car fill:#f9f
  click Dog href "https://example.com" "Tip"
`,
  state: `stateDiagram-v2
  direction LR
  state "Waiting" as Idle
  Running : working
  [*] --> Idle
  Idle --> Running : start
  state check <<choice>>
  state split <<fork>>
  state merge <<join>>
  state Active {
    [*] --> A
    --
    [*] --> B
  }
  note right of Idle : text
  note left of Running
    lines
  end note
  Running --> [*]
  classDef bad fill:#f00
  class Running bad
  Idle:::bad --> Active
  style Idle fill:#bbf
`,
  er: `erDiagram
  direction LR
  title Shop
  CUSTOMER ||--o{ ORDER : places
  ORDER }|..|{ ITEM : "has items"
  A |o--o| B : x
  PERSON only one to zero or more CAR : drives
  CAR one or more optionally to zero or one GARAGE : parks
  CUSTOMER {
    string name
    int id PK "the key"
    int addressId FK
    string email UK
  }
  p[Person] {
    string name
  }
  classDef pk fill:#f96
  class CUSTOMER pk
  style ORDER fill:#bbf
`,
  journey: `journey
  title Coffee
  section Ordering
    Choose a drink: 4: Me, Barista
`,
  gantt: `gantt
  title Plan
  dateFormat YYYY-MM-DD
  axisFormat %d %b
  tickInterval 1week
  excludes weekends
  weekend friday
  todayMarker off
  inclusiveEndDates
  section Design
    Wireframes :w1, 2024-01-01, 5d
    Build :b1, after w1, 10d
    Test :until m1
    Ship :done, crit, s1, 2024-02-01, 2d
    Launch :milestone, m1, 2024-03-01, 0d
    Freeze :vert, v1, 2024-02-20, 0d
  click b1 href "https://example.com"
`,
  pie: `pie showData
  title Pets
  "Dogs" : 386
  "Cats" : 85.5
`,
  quadrant: `quadrantChart
  title Reach
  x-axis Low --> High
  y-axis Low --> High
  quadrant-1 A
  quadrant-2 B
  quadrant-3 C
  quadrant-4 D
  P1: [0.3, 0.6]
  P2: [0.4, 0.3] radius: 12, color: #ff3300, stroke-color: #10f, stroke-width: 3px
  P3:::big: [0.7, 0.8]
  classDef big radius: 15, color: #ff0000
`,
  requirement: `requirementDiagram
  direction LR
  requirement login {
    id: 1
    text: "Users can log in"
    risk: high
    verifymethod: test
  }
  functionalRequirement f1 {
    id: 2
    text: "f"
    risk: low
    verifymethod: inspection
  }
  element page {
    type: "web page"
    docRef: "docs/login.md"
  }
  page - satisfies -> login
  login <- traces - f1
  classDef key fill:#f96
  class login key
  style page fill:#bbf
`,
  git: `gitGraph TB:
  commit id: "a"
  commit tag: "v1" type: HIGHLIGHT
  branch feature order: 1
  commit
  checkout main
  merge feature id: "m1" tag: "v2" type: REVERSE
  switch feature
  commit id: "fix"
  checkout main
  cherry-pick id: "fix"
`,
  c4: `C4Container
  title Bank
  Person(customer, "Customer", "A customer")
  Person_Ext(other, "Other")
  System_Boundary(b1, "Bank") {
    Container(api, "API", "Node.js", "Serves")
    ContainerDb(db, "DB", "Postgres")
  }
  System_Ext(mail, "Mail")
  Rel(customer, api, "Uses", "HTTPS")
  BiRel(api, db, "Reads")
  Rel_D(api, mail, "Sends")
  UpdateElementStyle(customer, $fontColor="red", $bgColor="grey")
  UpdateRelStyle(customer, api, $textColor="blue", $offsetY="-10")
  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
`,
  mindmap: `mindmap
  root((Trip))
    a[Square]
    b(Rounded)
    c))Bang((
    d)Cloud(
    e{{Hex}}
    Packing
    ::icon(fa fa-suitcase)
    Urgent
    :::urgent large
`,
  timeline: `timeline
  title Web
  section 1990s
    1991 : First page
  section 2000s
    2004 : Social : Web 2.0
    2007 : Phones
         : Stores
`,
  sankey: `sankey-beta
Solar,Grid,60
"Wind, offshore",Grid,30

Grid,Homes,45
`,
  xy: `xychart-beta horizontal
  title "Sales"
  x-axis "Month" [jan, feb, mar]
  y-axis "Revenue" 0 --> 100
  bar [5, 8, 3]
  line [4, 7, 6]
`,
  block: `block-beta
  columns 3
  a["Label"]:2 b
  space:2 c(("Circle"))
  block:group:2
    x y
  end
  arrow<["Next"]>(right)
  d[("Db")]
  a --> b
  a -- "label" --> c
  style a fill:#f96
  classDef warm fill:#f96
  class b warm
`,
  packet: `packet
  title TCP
  0-15: "Source"
  16: "Flag"
  +8: "Length"
`,
  kanban: `kanban
  todo[To do]
    t1[Fix login]@{ assigned: 'sam', ticket: 42, priority: 'Very Low' }
  done[Done]
    t2[Ship]
`,
  architecture: `architecture-beta
  group api(cloud)[API]
  group inner(server)[Inner] in api
  service db(database)[Database] in api
  service disk1(disk)[Disk] in inner
  service web(internet)[Web]
  junction j1
  db:R -- L:web
  db{group}:B --> T:j1
  j1:R <--> L:disk1
`,
  radar: `radar-beta
  title Skills
  axis a["Speed"], b["Power"], c["Range"]
  curve x["X"]{3, 5, 4}
  curve y{ a: 2, c: 5, b: 3 }
  max 5
  min 0
  ticks 5
  showLegend false
  graticule polygon
`,
  usecase: `usecase-beta
direction LR
actor Client("Client")
actor Admin("Admin")
Checkout("Checkout")
Pay("Pay")
Coupon("Coupon")
systemBoundary "Shop Front"
  Browse("Browse")
end
Shop_Front@{ type: package }
Client --> Checkout
Client -- "uses" --> Browse
Checkout ..>:include Pay
Coupon ..>:extend Checkout
Admin --|> Client
note for Pay "Card only"
classDef vip fill:#fc9
class Client vip
`,
  venn: `venn-beta
  title "Sets"
  set A["Alpha"]:20
    text a1["one"]
  set B
  union A,B["Both"]:5
  style A fill:gold
`,
  wardley: `wardley-beta
title Map
size [1100, 800]
evolution Idea -> Prototype -> Product -> Utility
anchor User [0.95, 0.60]
component Cup [0.80, 0.62] label [19, -4]
component Beans [0.62, 0.70]
User -> Cup
Cup -> Beans
evolve Beans 0.85
pipeline Cup {
  component Paper [0.30]
}
deaccelerator Rules [0.18, 0.60]
accelerator Market [0.30, 0.40]
note "A note" [0.42, 0.88]
annotations [1, 0]
annotation 1,[0.50, 0.15] "Changes"
`,
  cynefin: `cynefin-beta
  title Triage
  complex
    "A"
  clear
    "B"
  complex --> clear : "Solved"
`,
  railroad: `railroad-beta
  title R
  r = sequence(terminal("a"), optional(nonterminal("b")), zeroOrMore(terminal("c")), oneOrMore(choice(terminal("d"), terminal("e")))) ;
`,
  abnf: `railroad-abnf-beta
  title A
  word = 1*ALPHA *WSP [ "x" ] ( "a" / "b" ) ;
`,
  peg: `railroad-peg-beta
  title P
  N <- "0" / !"0" D+ &D D? D* ;
  D <- "1" ;
`,
};

describe('documented syntax parses with Mermaid', () => {
  for (const [name, code] of Object.entries(DOCUMENTED)) {
    test(name, async () => {
      const r = await parse(code);
      expect(r.ok || r.preview !== undefined, r.ok ? '' : r.error).toBe(true);
    });
  }
});
