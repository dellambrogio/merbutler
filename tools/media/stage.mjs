// The localStorage of a staged session: a small library, the checkout diagram open.
import { readFileSync } from 'node:fs';
export function stageScript(code, { galleryFamilies = ['Charts & data'], heights = {} } = {}) {
  const now = Date.now();
  const h = 3600e3, d = 24 * h;
  const diagrams = [
    { id: 'd1', name: 'Checkout flow', code, folder: 'Shop', created: now - 9 * d, updated: now - 2 * 60e3 },
    { id: 'd2', name: 'Returns', code: 'flowchart LR\n  a[Request] --> b{Approved?}\n  b -->|yes| c[Refund]\n  b -->|no| d[Reply]\n', folder: 'Shop', created: now - 8 * d, updated: now - 3 * h },
    { id: 'd3', name: 'Order states', code: 'stateDiagram-v2\n  [*] --> Placed\n  Placed --> Paid\n  Paid --> Shipped\n  Shipped --> [*]\n', folder: 'Shop', created: now - 7 * d, updated: now - 1 * d },
    { id: 'd4', name: 'Login sequence', code: 'sequenceDiagram\n  User->>App: Sign in\n  App->>Auth: Check\n  Auth-->>App: Token\n', folder: 'Platform', created: now - 6 * d, updated: now - 2 * d },
    { id: 'd5', name: 'Release plan', code: 'gantt\n  title Release\n  section Build\n  Code :a1, 2026-11-01, 10d\n  Test :after a1, 5d\n', created: now - 5 * d, updated: now - 4 * d },
  ];
  const set = {
    'merbutler:code': code,
    'merbutler:diagrams': JSON.stringify(diagrams),
    'merbutler:folders': JSON.stringify(['Platform', 'Shop']),
    'merbutler:open-diagram': 'd1',
    'merbutler:galleryFamilies': JSON.stringify(galleryFamilies),
    'merbutler:sectionHeights': JSON.stringify(heights),
  };
  return `localStorage.clear(); ${Object.entries(set).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')}`;
}
export const CODE = readFileSync(new URL('./checkout.mmd', import.meta.url), 'utf8');
