import type { Matrix } from '../core/matrix.js';
import type { MatrixLibrary } from '../core/expression.js';
import type { ComputationTrace, JsonValue } from '../core/protocol.js';
import type { Story } from '../presentation/storyTypes.js';
import type { Scene } from '../scene/types.js';

export interface DebugContext {
  matrices: readonly Matrix[];
  library: MatrixLibrary;
}

export interface DebugFunctionParam {
  key: string;
  label: string;
  kind: 'matrix' | 'number' | 'integer';
  description?: string;
  defaultValue: JsonValue;
}

export interface DebugArtifact {
  id: string;
  label: string;
  kind: 'matrix' | 'scalar' | 'text';
  preview: string;
  matrix?: Matrix;
  scalar?: string;
}

export interface DebugRunResult {
  ok: boolean;
  functionId: string;
  trace: ComputationTrace;
  artifacts: DebugArtifact[];
  story?: Story;
  scenes: Scene[];
  error?: string;
}

export interface DebugFunctionDefinition {
  id: string;
  name: string;
  group: string;
  description: string;
  signature: string;
  params: DebugFunctionParam[];
  defaults: Record<string, JsonValue>;
  run: (args: Record<string, JsonValue>, context: DebugContext) => DebugRunResult;
}
