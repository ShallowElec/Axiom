/**
 * Presentation protocol for the storyboard renderer.
 *
 * These objects are pure data: the renderer turns them into React elements and
 * has no access to the math engine. Story compilers are the only producers.
 */

import type { BlockAssembly, Matrix } from '../core/matrix.js';
import type { OperationType, RuntimeValue } from '../core/protocol.js';

export type CellTone =
  | 'neutral'
  | 'source'
  | 'scan'
  | 'active'
  | 'pivot'
  | 'live'
  | 'result'
  | 'done'
  | 'dim';

export interface CellState {
  tone?: CellTone;
  text?: string;
  hidden?: boolean;
}

export type CellStateMap = Record<string, CellState>;

export type PanelRole = 'input' | 'result' | 'auxiliary' | 'workspace';

export interface StoryPanel {
  key: string;
  label: string;
  matrix: Matrix;
  role: PanelRole;
  caption: string;
  shape: string;
  cells: CellStateMap;
  rowFocus: number[];
  colFocus: number[];
  dividerAfter: number | null;
  bracketTone: string;
  emptyNote?: string;
}

export interface PanelOptions {
  key?: string;
  role?: PanelRole;
  caption?: string;
  cells?: CellStateMap;
  rowFocus?: number[];
  colFocus?: number[];
  dividerAfter?: number | null;
  bracketTone?: string;
  emptyNote?: string;
}

export type TermState = 'done' | 'active' | 'future';

export interface LensTerm {
  label: string;
  expr: string;
  value: string;
  state: TermState;
}

export interface LensAccumulator {
  label: string;
  value: string;
}

export interface StoryLens {
  kicker: string;
  heading: string;
  equation: string;
  terms: LensTerm[];
  accumulator: LensAccumulator | null;
  note: string;
  rule: string;
}

export type ReadoutTone = 'live' | 'done' | 'result' | 'pivot';

export interface StoryReadout {
  label: string;
  value: string;
  note: string;
  tone: ReadoutTone;
}

export interface StoryBeat {
  id: string;
  title: string;
  narration: string;
  panels: StoryPanel[];
  connectors: string[];
  lens: StoryLens;
  readout: StoryReadout | null;
  isFinale: boolean;
  duration: number | null;
}

export interface StoryChapter {
  id: string;
  title: string;
  tag: string;
  description: string;
  beats: StoryBeat[];
}

export interface StorySourceRef {
  name: string;
  matrix: Matrix;
}

export interface StoryResultMeta {
  kind: 'matrix' | 'scalar';
  label: string;
  rows: number | null;
  cols: number | null;
  formatted: string;
}

export interface StoryMeta {
  expression: string;
  rule: string;
  meaning: string;
  tag: string;
  eyebrow: string;
  operationCount: number;
  sources: StorySourceRef[];
  result: StoryResultMeta;
  shapeChain: string;
  rootType: OperationType | 'identity' | 'generic';
}

export interface StoryTemplateOverride {
  title?: string;
  eyebrow?: string;
  description?: string;
}

export interface StoryOptions {
  template?: StoryTemplateOverride;
}

export interface Story {
  id: string;
  title: string;
  eyebrow: string;
  expression: string;
  inputExpression: string;
  description: string;
  chapters: StoryChapter[];
  meta: StoryMeta;
  resultValue: RuntimeValue;
  source: 'expression' | 'block';
  options?: StoryOptions;
}

export interface FlatBeat extends StoryBeat {
  chapterIndex: number;
  beatIndex: number;
  chapterTitle: string;
  chapterTag: string;
  index: number;
}

export interface OperationCopy {
  eyebrow: string;
  title: string;
  rule: string;
  meaning: string;
  tag: string;
}

export interface BeatFields {
  title: string;
  narration?: string;
  panels?: StoryPanel[];
  connectors?: string[];
  lens?: Partial<StoryLens>;
  readout?: StoryReadout | null;
  isFinale?: boolean;
  duration?: number | null;
}

export interface LensFields {
  kicker: string;
  heading: string;
  equation: string;
  terms?: LensTerm[];
  accumulator?: LensAccumulator | null;
  note?: string;
  rule?: string;
}

export interface BuildStoryOptions {
  template?: StoryTemplateOverride;
}

export interface BlockStoryInput {
  grid: (Matrix | null)[][];
  built: BlockAssembly;
  expression?: string;
  resultName?: string;
}

export type StoryRootType = OperationType | 'identity' | 'generic';
