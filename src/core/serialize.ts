/** FlowModel -> Mermaid text, by diagram kind. Each kind's writer lives with its type. */
import type { FlowModel } from './model';
import { serializeFlowchart } from '../flowchart/serializeFlowchart';
import { serializeState } from '../state/stateDiagram';
import { serializeUsecase } from '../usecase/usecaseDiagram';
import { withPositionLines } from './positions';

export function serialize(model: FlowModel): string {
  const text = model.kind === 'state' ? serializeState(model) : model.kind === 'usecase' ? serializeUsecase(model) : serializeFlowchart(model);
  // A free layout's positions go in a comment at the end.
  return withPositionLines(text, model);
}
