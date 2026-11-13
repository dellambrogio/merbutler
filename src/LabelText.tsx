import { Fragment, type JSX } from 'react';
import { labelLines, markdownRuns } from './labels';

/**
 * Shows a label with line breaks, and bold and italic for Markdown labels.
 * Builds React elements only: other HTML in a label is shown as text, never run.
 */
export function LabelText({ text, markdown }: { text: string; markdown: boolean }): JSX.Element {
  const lines = labelLines(text, markdown);
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {markdown
            ? markdownRuns(line).map((run, j) => {
                if (run.bold) return <strong key={j}>{run.text}</strong>;
                if (run.italic) return <em key={j}>{run.text}</em>;
                return <Fragment key={j}>{run.text}</Fragment>;
              })
            : line}
        </Fragment>
      ))}
    </>
  );
}
