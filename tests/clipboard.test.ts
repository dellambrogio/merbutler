import { describe, expect, test } from 'vitest';
import { extractMermaid } from '../src/clipboard';

describe('extractMermaid', () => {
  test('keeps text without fences', () => {
    expect(extractMermaid('flowchart LR\n  a --> b\n')).toEqual({ code: 'flowchart LR\n  a --> b\n', fenced: false });
  });

  test('takes the body of a mermaid fence', () => {
    const text = '```mermaid\nflowchart LR\n  a --> b\n```';
    expect(extractMermaid(text)).toEqual({ code: 'flowchart LR\n  a --> b\n', fenced: true });
  });

  test('takes the body of a fence without a language', () => {
    expect(extractMermaid('```\ngraph TD\n  x\n```\n').code).toBe('graph TD\n  x\n');
  });

  test('ignores the text around the fence', () => {
    const text = 'Here is your diagram:\n\n```mermaid\nflowchart TB\n  a\n```\n\nIt shows a node.';
    expect(extractMermaid(text).code).toBe('flowchart TB\n  a\n');
  });

  test('prefers the first mermaid block over other blocks', () => {
    const text = '```sh\nnpm i\n```\n```mermaid\nflowchart LR\n  one\n```\n```mermaid\nflowchart LR\n  two\n```';
    expect(extractMermaid(text).code).toBe('flowchart LR\n  one\n');
  });

  test('normalizes CRLF line endings', () => {
    expect(extractMermaid('```mermaid\r\nflowchart LR\r\n  a\r\n```\r\n')).toEqual({
      code: 'flowchart LR\n  a\n',
      fenced: true,
    });
    expect(extractMermaid('flowchart LR\r\n  a').code).toBe('flowchart LR\n  a');
  });

  test('supports tilde fences, longer fences and uppercase tags', () => {
    expect(extractMermaid('~~~Mermaid\nflowchart LR\n  a\n~~~').code).toBe('flowchart LR\n  a\n');
    expect(extractMermaid('````mermaid\nflowchart LR\n  a\n````').code).toBe('flowchart LR\n  a\n');
  });

  test('an unclosed fence is not a block', () => {
    expect(extractMermaid('```mermaid\nflowchart LR').fenced).toBe(false);
  });
});
