/**
 * Axiom runtime contracts.
 *
 * The first slice wraps the existing exact engine and story compiler. It does
 * not pretend the resulting events are native kernel traces: `provenance` is a
 * required field, and the UI must keep `derived` visible.
 */

import type { Matrix, StoredMatrix } from '../core/matrix.js';
import type { OperationType, RuntimeValue } from '../core/protocol.js';
import type { Scene } from '../scene/types.js';
import type { CellTone } from '../presentation/storyTypes.js';

export type RunId = string;
export type StepId = string;
export type MicroframeId = string;
export type ValueId = string;
export type SceneNodeId = string;

export type RunKind = 'expression' | 'function';
export type RunStatus = 'computing' | 'completed' | 'failed' | 'cancelled';
export type Provenance = 'derived' | 'native';

export interface WorkbenchDocument {
  revision: number;
  objects: StoredMatrix[];
  expression: string;
}

export interface StageCell {
  text: string;
  tone: CellTone;
  hidden: boolean;
}

export interface StagePanel {
  key: string;
  label: string;
  role: 'input' | 'result' | 'auxiliary' | 'workspace';
  caption: string;
  shape: string;
  rows: number;
  cols: number;
  cells: StageCell[][];
  rowFocus: number[];
  colFocus: number[];
  valueId: ValueId;
}

export interface StageLensTerm {
  label: string;
  expr: string;
  value: string;
  state: 'done' | 'active' | 'future';
}

export interface StageLens {
  kicker: string;
  heading: string;
  equation: string;
  terms: StageLensTerm[];
  accumulator: { label: string; value: string } | null;
  note: string;
  rule: string;
}

export interface StageReadout {
  label: string;
  value: string;
  note: string;
  tone: 'live' | 'done' | 'result' | 'pivot';
}

export interface StageFrame {
  stepId: StepId;
  panels: StagePanel[];
  connectors: string[];
  lens: StageLens;
  readout: StageReadout | null;
  isFinale: boolean;
}

export interface Microframe {
  id: MicroframeId;
  stepId: StepId;
  index: number;
  kind: 'reveal' | 'source' | 'multiply' | 'accumulate' | 'write' | 'gradient' | 'control';
  label: string;
  detail: string;
  equation?: string;
  value?: string;
  durationHintMs: number;
}

export interface TraceGroup {
  id: string;
  label: string;
  kind: 'chapter' | 'phase' | 'loop';
  stepIds: StepId[];
}

export interface ExecutionStep {
  id: StepId;
  index: number;
  groupId: string;
  phase: 'forward' | 'control' | 'backward';
  nodeId: string;
  op: OperationType | 'derived';
  title: string;
  detail: string;
  status: 'ok' | 'warning' | 'error' | 'skipped';
  provenance: Provenance;
  inputs: ValueId[];
  outputs: ValueId[];
  microframeIds: MicroframeId[];
}

export interface NativeCheckpoint {
  id: string;
  index: number;
  operationId: string;
  label: string;
  values: Record<ValueId, ValueSnapshot>;
  matrixValueIds: ValueId[];
  scalarValueIds: ValueId[];
  complete: boolean;
  createdAtIso: string;
}

export interface NativeOperation {
  id: string;
  index: number;
  kind: 'input' | 'cell' | 'operation' | 'result';
  op: OperationType | 'input' | 'result';
  label: string;
  expression: string;
  operands: ValueId[];
  resultValueId?: ValueId;
  checkpointId: string;
  coordinates?: { row: number; col: number };
}

export interface NativeTrace {
  schemaVersion: 1;
  runId: RunId;
  engine: { id: 'exact-q'; version: 1; backend: 'ts' };
  granularity: 'operation' | 'cell';
  durationMs?: number;
  operations: NativeOperation[];
  checkpoints: Record<string, NativeCheckpoint>;
}

export interface ValueSnapshot {
  id: ValueId;
  label: string;
  kind: 'matrix' | 'scalar' | 'symbolic';
  shape?: { rows: number; cols: number };
  dtype: 'Q';
  preview: string;
  matrix?: Matrix;
  scalar?: string;
}

export interface RunSummary {
  title: string;
  expression: string;
  inputExpression: string;
  description: string;
  eyebrow: string;
  shapeChain: string;
  rule: string;
  meaning: string;
  operationCount: number;
}

export interface RunError {
  code: string;
  message: string;
  detail?: string;
}

export interface RunRecord {
  schemaVersion: 1;
  id: RunId;
  kind: RunKind;
  status: RunStatus;
  provenance: Provenance;
  presentationProvenance: Provenance;
  documentRevision: number;
  expression: string;
  createdAtIso: string;
  completedAtIso?: string;
  durationMs?: number;
  engine: { id: 'exact-q'; version: 1; backend: 'ts' };
  summary: RunSummary;
  groups: TraceGroup[];
  steps: ExecutionStep[];
  values: Record<ValueId, ValueSnapshot>;
  frames: Record<StepId, StageFrame>;
  microframes: Record<StepId, Microframe[]>;
  scenes: Record<StepId, { flat: Scene; layered: Scene }>;
  resultValue?: RuntimeValue;
  error?: RunError;
  native?: NativeTrace;
  lineage?: { parentRunId: RunId; forkedFromStepId: StepId; checkpointId?: string };
}

export interface ReplayState {
  runId: RunId | null;
  stepIndex: number;
  microIndex: number;
  status: 'idle' | 'playing' | 'paused' | 'ended';
  speed: number;
  detail: 'step' | 'micro';
  loop: boolean;
}

export type Selection =
  | { kind: 'cell'; stepIndex: number; panelKey: string; row: number; col: number }
  | { kind: 'panel'; stepIndex: number; panelKey: string }
  | { kind: 'scene-node'; stepIndex: number; space: 'flat' | 'layered'; nodeId: string }
  | null;

export interface Problem {
  id: string;
  severity: 'error' | 'warning';
  message: string;
  detail?: string;
  code?: string;
}

export interface WorkbenchState {
  document: WorkbenchDocument;
  runs: RunRecord[];
  activeRunId: RunId | null;
  replay: ReplayState;
  selection: Selection;
  problems: Problem[];
  nextRunNumber: number;
}

export interface RunOptions {
  expression?: string;
  storyOptions?: {
    template?: {
      title?: string;
      eyebrow?: string;
      description?: string;
    };
  };
  autoPlay?: boolean;
  kind?: RunKind;
  lineage?: RunRecord['lineage'];
}

export type StoryRunner = (
  expression: string,
  objects: readonly StoredMatrix[],
  storyOptions?: RunOptions['storyOptions'],
) => import('../presentation/storyTypes.js').Story;

export interface BuildRunOptions {
  runId: RunId;
  documentRevision: number;
  kind: RunKind;
  startedAt: number;
  completedAt: number;
  storyOptions?: RunOptions['storyOptions'];
  lineage?: RunRecord['lineage'];
}
