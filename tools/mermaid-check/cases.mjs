/**
 * Free layouts for the Mermaid check: the code, and where each element was drawn (its center).
 * `known` marks a case that is expected to fail, with the reason.
 */
export const CASES = [
  {
    name: 'unlinked row',
    code: 'flowchart LR\n  a\n  b\n  c\n  d\n',
    at: { a: [0, 0], b: [200, 0], c: [400, 0], d: [0, 300] },
  },
  {
    name: 'chain drawn as a column',
    code: 'flowchart LR\n  a --> b --> c\n  x\n',
    at: { a: [0, 0], b: [0, 150], c: [0, 300], x: [400, 0] },
  },
  {
    name: 'chain pointing back along a row',
    code: 'flowchart TB\n  c --> b --> a\n  x\n',
    at: { a: [0, 0], b: [200, 0], c: [400, 0], x: [0, 300] },
  },
  {
    name: 'row that goes back, with a gap',
    code: 'flowchart TB\n  c --> b\n  a\n  x\n',
    at: { a: [0, 0], b: [200, 0], c: [400, 0], x: [0, 300] },
  },
  {
    name: 'links and gaps in one row',
    code: 'flowchart TB\n  a --> b\n  c\n  d\n  x\n',
    at: { a: [0, 0], b: [200, 0], c: [400, 0], d: [600, 0], x: [0, 400] },
  },
  {
    name: 'link past a node in between',
    code: 'flowchart TB\n  a --> c\n  b\n  x\n',
    at: { a: [0, 0], b: [200, 0], c: [400, 0], x: [0, 400] },
    known: 'the long link a --> c takes a place in b’s rank',
  },
  {
    name: 'whole diagram, unlinked row',
    code: 'flowchart TB\n  a\n  b\n  c\n',
    at: { a: [0, 0], b: [200, 0], c: [400, 0] },
  },
  {
    name: 'row linked to the outside, across TB',
    code: 'flowchart TB\n  a --> x\n  b --> x\n',
    at: { a: [0, 0], b: [200, 0], x: [100, 300] },
  },
  {
    name: 'row linked to the outside, along LR',
    code: 'flowchart LR\n  a --> x\n  b --> x\n',
    at: { a: [0, 0], b: [200, 0], x: [100, 300] },
  },
  {
    name: 'fan-out and fan-in drawn as a row',
    code: 'flowchart TB\n  start --> b1\n  start --> b2\n  start --> b3\n  b1 --> done\n  b2 --> done\n  b3 --> done\n',
    at: { start: [200, 0], b1: [0, 150], b2: [200, 150], b3: [400, 150], done: [200, 300] },
  },
  {
    name: 'column askew by a few pixels',
    code: 'flowchart LR\n  b\n  a\n  x\n',
    at: { a: [21, 0], b: [19, 100], x: [400, 400] },
  },
  {
    name: 'row inside a subgraph',
    code: 'flowchart LR\n  subgraph s\n    a\n    b\n  end\n  x\n',
    at: { a: [0, 300], b: [200, 300], s: [100, 300], x: [500, 0] },
  },
  {
    name: 'subgraph in a row with nodes, and a row inside it',
    code: 'flowchart TB\n  subgraph s\n    a\n    b\n    c\n  end\n  x\n  y\n  z\n',
    at: { a: [0, 0], b: [150, 0], c: [75, 200], s: [75, 100], x: [400, 100], y: [600, 100], z: [0, 600] },
  },
  {
    name: 'grid: rows win over columns',
    code: 'flowchart LR\n  a\n  b\n  c\n  d\n  e\n  f\n',
    at: { a: [0, 0], b: [200, 0], c: [400, 0], d: [0, 200], e: [200, 200], f: [400, 200] },
  },
  {
    name: 'README demo: apps in a row, Frontend above Backend',
    code: 'flowchart LR\n  subgraph Frontend\n    web[Web app]\n    mobile[Mobile app]\n    admin[Admin console]\n  end\n  subgraph Backend\n    api[API] --> db[(Database)]\n    api --> queue[[Queue]]\n  end\n  Frontend --> api\n',
    at: { web: [0, 0], mobile: [200, 0], admin: [400, 0], Frontend: [200, 0], api: [200, 300], db: [100, 450], queue: [300, 450], Backend: [200, 380] },
  },
];
