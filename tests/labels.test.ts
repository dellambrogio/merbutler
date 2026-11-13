import { describe, expect, test } from 'vitest';
import { fromEditText, labelLines, markdownRuns, textMetrics, toEditText } from '../src/labels';
import { nodeSize } from '../src/layout';

describe('labels', () => {
  test('splits lines on <br> variants, and on newlines in Markdown only', () => {
    expect(labelLines('a<br>b<BR/>c<br />d', false)).toEqual(['a', 'b', 'c', 'd']);
    expect(labelLines('a\nb', false)).toEqual(['a\nb']);
    expect(labelLines('a\nb<br>c', true)).toEqual(['a', 'b', 'c']);
  });

  test('converts between labels and edit text', () => {
    expect(toEditText('a<br/>b')).toBe('a\nb');
    expect(fromEditText(' a\r\nb ', false)).toBe('a<br>b');
    expect(fromEditText('a\nb', true)).toBe('a\nb');
  });

  test('finds bold and italic runs', () => {
    expect(markdownRuns('**bold** and *italic* x')).toEqual([
      { text: 'bold', bold: true, italic: false },
      { text: ' and ', bold: false, italic: false },
      { text: 'italic', bold: false, italic: true },
      { text: ' x', bold: false, italic: false },
    ]);
    expect(markdownRuns('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4', bold: false, italic: false }]);
  });

  test('measures visible text without Markdown markers', () => {
    expect(textMetrics('**abc**<br>de', true)).toEqual({ longest: 3, lines: 2 });
    expect(textMetrics('**abc**', false)).toEqual({ longest: 7, lines: 1 });
  });

  test('a label with more lines makes a taller node', () => {
    const one = nodeSize('line', 'rect');
    const three = nodeSize('line<br>line<br>line', 'rect');
    expect(three.height).toBeGreaterThan(one.height + 30);
    expect(three.width).toBe(one.width);
    const circle = nodeSize('a<br>b<br>c<br>d', 'circle');
    expect(circle.width).toBe(circle.height);
  });
});
