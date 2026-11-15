/**
 * The node panel: the selected node, or subgraph (a lane, a composite state, a system boundary),
 * with the fields of the open diagram's type.
 */
import type { JSX } from 'react';
import type { FlowNode, FlowSubgraph } from '../core/model';
import type { InspectorProps } from '../canvas/fields';
import { FlowNodeInspector, FlowSubgraphInspector } from './inspectors/flowchart';
import { StateNodeInspector, StateSubgraphInspector } from './inspectors/state';
import { UseCaseBoundaryInspector, UseCaseNodeInspector } from './inspectors/usecase';

export function NodePanel({ node, subgraph, lane, ...props }: InspectorProps & {
  node?: FlowNode;
  subgraph?: FlowSubgraph;
  /** The subgraph is a lane of a swimlane diagram. */
  lane: boolean;
}): JSX.Element | null {
  const kind = props.model.kind;
  if (node) {
    if (kind === 'state') return <StateNodeInspector {...props} node={node} />;
    if (kind === 'usecase') return <UseCaseNodeInspector {...props} node={node} />;
    return <FlowNodeInspector {...props} node={node} />;
  }
  if (subgraph) {
    if (kind === 'state') return <StateSubgraphInspector {...props} subgraph={subgraph} />;
    if (kind === 'usecase') return <UseCaseBoundaryInspector {...props} subgraph={subgraph} />;
    return <FlowSubgraphInspector {...props} subgraph={subgraph} lane={lane} />;
  }
  return null;
}
