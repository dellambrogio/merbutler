import { describe, expect, test } from 'vitest';
import { MERMAID_EXAMPLES } from '../src/gallery/mermaidExamples';
import { parse } from '../src/core/parse';
import { insertLine, moveLine, normalizeTable, readTable, removeLine, setCells, setSection, TABLE_SPECS, writeTable, type TableDoc } from '../src/structured/tables';

const SECTIONS: Record<string, string> = {
  'pie-chart': 'Pie chart',
  'sankey-diagram': 'Sankey diagram',
  'packet-diagram': 'Packet diagram',
  'radar-diagram': 'Radar chart',
  'xy-chart': 'XY chart',
  'quadrant-chart': 'Quadrant chart',
  'timeline-diagram': 'Timeline',
  'user-journey-diagram': 'User journey',
  'gantt-chart': 'Gantt chart',
  'git-graph': 'Git graph',
  'sequence-diagram': 'Sequence diagram',
  'class-diagram': 'Class diagram',
  'entity-relationship-diagram': 'Entity relationship diagram',
  'requirement-diagram': 'Requirement diagram',
  'c4-diagram': 'C4 diagram',
  'architecture-diagram': 'Architecture diagram',
  'block-diagram': 'Block diagram',
};
const cases = MERMAID_EXAMPLES.filter((s) => s.id in SECTIONS).flatMap((s) => s.examples.map((e) => [SECTIONS[s.id], e.title, e.code] as const));

const ok = (d: TableDoc | null): TableDoc => {
  if (!d) throw new Error('no header');
  return d;
};

async function mermaidReads(code: string, typeName: string): Promise<void> {
  const r = await parse(code);
  expect(r.ok ? 'canvas' : r.preview?.name, r.ok ? code : `${r.error}\n${code}`).toBe(typeName);
}

describe('table editors', () => {
  test('packet ranges are renumbered to follow each other', () => {
    const spec = TABLE_SPECS['Packet diagram'];
    expect(spec.normalize!([['0-15', 'a'], ['+8', 'b'], ['16-31', 'c'], ['40', 'd']])).toEqual([
      ['0-15', 'a'],
      ['+8', 'b'],
      ['24-39', 'c'],
      ['40', 'd'],
    ]);
  });

  test.each(cases)('%s / %s: read and written back unchanged, with rows', (typeName, _title, code) => {
    const doc = ok(readTable(code, TABLE_SPECS[typeName]));
    expect(writeTable(doc)).toBe(code.endsWith('\n') ? code : `${code}\n`);
    expect(doc.lines.some((l) => l.kind === 'row')).toBe(true);
  });

  test.each(cases)('%s / %s: edit a cell, add a row and a section, move and delete: Mermaid still reads it', async (typeName, _title, code) => {
    const spec = TABLE_SPECS[typeName];
    let doc = ok(readTable(code, spec));
    const first = doc.lines.findIndex((l) => l.kind === 'row');
    const row = doc.lines[first];
    if (row.kind !== 'row') throw new Error('no row');
    // Written again from its cells: the spec's writer must give a line Mermaid reads the same way.
    doc = setCells(doc, spec, first, row.cells);
    expect(spec.read(doc.lines[first].text.trim())).toEqual(row.cells);
    let r = insertLine(doc, spec, first, 'row');
    doc = r.doc;
    expect(doc.lines[r.index].kind).toBe('row');
    if (spec.section) {
      r = insertLine(doc, spec, null, 'section');
      doc = setSection(r.doc, spec, r.index, 'Later');
      doc = insertLine(doc, spec, r.index, 'row').doc;
    }
    r = moveLine(doc, first, 1);
    doc = removeLine(r.doc, r.index);
    await mermaidReads(writeTable(normalizeTable(doc, spec)), typeName);
  });

  test('pie rows, quoting and numbers', () => {
    const spec = TABLE_SPECS['Pie chart'];
    let doc = ok(readTable('pie title Pets\n    "Dogs" : 386\n    "Cats" : 85\n', spec));
    expect(doc.lines.filter((l) => l.kind === 'row').map((l) => (l.kind === 'row' ? l.cells : []))).toEqual([
      ['Dogs', '386'],
      ['Cats', '85'],
    ]);
    doc = setCells(doc, spec, 1, ['Big "cats"', '9x0']);
    expect(writeTable(doc)).toBe("pie title Pets\n    \"Dogs\" : 386\n    \"Big 'cats'\" : 90\n");
    doc = insertLine(doc, spec, null, 'row').doc;
    expect(writeTable(doc)).toContain('\n    "Big \'cats\'" : 90\n    "Big \'cats\'" : 90\n');
    const empty = insertLine(ok(readTable('pie title Pets\n', spec)), spec, null, 'row').doc;
    expect(writeTable(empty)).toBe('pie title Pets\n    "New slice" : 10\n');
  });

  test('sankey CSV quoting', () => {
    const spec = TABLE_SPECS['Sankey diagram'];
    const doc = ok(readTable('sankey-beta\n\n"A, Inc",B,3\n', spec));
    const row = doc.lines.find((l) => l.kind === 'row');
    expect(row?.kind === 'row' && row.cells).toEqual(['A, Inc', 'B', '3']);
    expect(spec.write(['A, Inc', 'B', '3'])).toBe('"A, Inc",B,3');
  });

  test('relation rows of graph types', () => {
    const row = (typeName: string, line: string): string[] | null => TABLE_SPECS[typeName].read(line);
    expect(row('Sequence diagram', 'John-->>-Alice: Hi Alice, I can hear you!')).toEqual(['John', '-->>-', 'Alice', 'Hi Alice, I can hear you!']);
    expect(TABLE_SPECS['Sequence diagram'].write(['John', '-->>-', 'Alice', 'Hi'])).toBe('John-->>-Alice: Hi');
    expect(row('Class diagram', 'Customer "1" --> "0..*" Order : places')).toEqual(['Customer', '1', '-->', '0..*', 'Order', 'places']);
    expect(row('Class diagram', 'Animal : +int age')).toBeNull();
    expect(row('Entity relationship diagram', 'PLAN ||--o{ SUBSCRIPTION : "subscribed via"')).toEqual(['PLAN', '||--o{', 'SUBSCRIPTION', 'subscribed via']);
    expect(TABLE_SPECS['Entity relationship diagram'].write(['A', '||--o{', 'B', 'two words'])).toBe('A ||--o{ B : "two words"');
    expect(row('C4 diagram', 'Rel(SystemAA, SystemC, "Sends e-mails", "SMTP")')).toEqual(['Rel', 'SystemAA', 'SystemC', 'Sends e-mails', 'SMTP']);
    expect(row('Architecture diagram', 'api:B --> T:db')).toEqual(['api', 'B', '-->', 'T', 'db']);
    expect(row('Block diagram', 'a -- "goes to" --> b')).toEqual(['a', 'goes to', '-->', 'b']);
    expect(row('Requirement diagram', 'brake_controller - satisfies -> brake_response')).toEqual(['brake_controller', 'satisfies', 'brake_response']);
  });
});
