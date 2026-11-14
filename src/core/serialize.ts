/** FlowModel -> Mermaid text, by diagram kind. Each kind's writer lives with its type. */
import type { FlowModel } from './model';
import { serializeFlowchart } from '../flowchart/serializeFlowchart';
import { serializeState } from '../state/stateDiagram';
import { serializeUsecase } from '../usecase/usecaseDiagram';

export function serialize(model: FlowModel): string {
  if (model.kind === 'state') return serializeState(model);
  if (model.kind === 'usecase') return serializeUsecase(model);
  return serializeFlowchart(model);
}
