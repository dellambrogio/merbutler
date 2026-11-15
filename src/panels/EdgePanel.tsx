/** The edge panel: the selected edge (a link, a transition, a relation), with the fields of the open diagram's type. */
import type { JSX } from 'react';
import type { FlowEdge } from '../core/model';
import type { InspectorProps } from '../canvas/fields';
import { FlowEdgeInspector } from './inspectors/flowchart';
import { StateEdgeInspector } from './inspectors/state';
import { UseCaseEdgeInspector } from './inspectors/usecase';

export function EdgePanel({ edge, ...props }: InspectorProps & { edge: FlowEdge }): JSX.Element {
  if (props.model.kind === 'state') return <StateEdgeInspector {...props} edge={edge} />;
  if (props.model.kind === 'usecase') return <UseCaseEdgeInspector {...props} edge={edge} />;
  return <FlowEdgeInspector {...props} edge={edge} />;
}
