import type { JSX } from 'react';
import { OutlineEditor } from './OutlineEditor';
import { OUTLINE_TYPES } from './outline';
import { TABLE_EDITORS } from './tables';

/** The kind of editor panel a type has, for badges: 'outline', 'table', or null. */
export function structuredKind(typeName: string): 'outline' | 'table' | null {
  return OUTLINE_TYPES.has(typeName) ? 'outline' : typeName in TABLE_EDITORS ? 'table' : null;
}

/** True if a diagram type has an editor panel next to its preview. */
export function hasStructuredEditor(typeName: string): boolean {
  return OUTLINE_TYPES.has(typeName) || typeName in TABLE_EDITORS;
}

interface StructuredEditorProps {
  code: string;
  typeName: string;
  editable: boolean;
  onChange: (code: string) => void;
}

/** The editor panel of a type that is not a node-and-edge graph: an outline or a table. */
export function StructuredEditor(props: StructuredEditorProps): JSX.Element | null {
  if (OUTLINE_TYPES.has(props.typeName)) return <OutlineEditor {...props} />;
  const Table = TABLE_EDITORS[props.typeName];
  return Table ? <Table {...props} /> : null;
}
