import { Fragment, type JSX } from 'react';
import { splitIcons, useIcon } from '../flowchart/icons';
import { labelLines, markdownRuns } from '../core/labels';

/** A `fa:fa-name` token: the icon at text size, or the token as text if there is no such icon. */
function LabelIcon({ name, source }: { name: string; source: string }): JSX.Element {
  const icon = useIcon(name);
  if (!icon) return <>{source}</>;
  return (
    <svg
      className="label-icon"
      viewBox={icon.viewBox}
      aria-label={name}
      role="img"
      // The SVG comes from the bundled icon packs, not from the diagram code.
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}

/** Text with its `fa:fa-name` icons. */
function TextWithIcons({ text }: { text: string }): JSX.Element {
  return (
    <>
      {splitIcons(text).map((part, i) =>
        'icon' in part ? <LabelIcon key={i} name={part.icon} source={part.source} /> : <Fragment key={i}>{part.text}</Fragment>,
      )}
    </>
  );
}

/**
 * Shows a label with line breaks, bold and italic for Markdown labels, and FontAwesome icons
 * (`fa:fa-name`). Builds React elements only: other HTML in a label is shown as text, never run.
 */
export function LabelText({ text, markdown }: { text: string; markdown: boolean }): JSX.Element {
  const lines = labelLines(text, markdown);
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {markdown ? (
            markdownRuns(line).map((run, j) => {
              const content = <TextWithIcons text={run.text} />;
              if (run.bold) return <strong key={j}>{content}</strong>;
              if (run.italic) return <em key={j}>{content}</em>;
              return <Fragment key={j}>{content}</Fragment>;
            })
          ) : (
            <TextWithIcons text={line} />
          )}
        </Fragment>
      ))}
    </>
  );
}
