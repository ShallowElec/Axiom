/**
 * Renderer-neutral scene protocol.
 *
 * A Scene is produced by presentation code from a Trace/Storyboard. Renderers
 * (2D, layered, flat, future 3D/stream) consume only this object. Scenes carry
 * semantic ids and values, never DOM nodes or pixels.
 */

import type { CellTone } from '../presentation/storyTypes.js';

export type SceneSpace = 'layered' | 'flat';

export type SceneRole =
  | 'input'
  | 'parameter'
  | 'operation'
  | 'intermediate'
  | 'result'
  | 'observation'
  | 'error';

export type SceneStatus = 'past' | 'active' | 'future' | 'done';

export interface SceneCell {
  text: string;
  tone?: CellTone;
  hidden?: boolean;
}

export interface SceneMatrixPreview {
  rows: number;
  cols: number;
  cells: SceneCell[][];
}

export interface SceneNode {
  id: string;
  role: SceneRole;
  label: string;
  detail?: string;
  badge?: string;
  sourceStepId?: string;
  sourceValueIds?: string[];
  stage: number;
  lane: number;
  status: SceneStatus;
  shape?: { rows: number; cols: number };
  matrix?: SceneMatrixPreview;
  metrics?: Record<string, string | number>;
}

export interface SceneEdge {
  id: string;
  from: string;
  to: string;
  kind: 'data' | 'control' | 'feedback';
  label?: string;
}

export interface SceneLegendItem {
  role: SceneRole;
  label: string;
}

export interface SceneGroup {
  id: string;
  label: string;
  kind: 'chapter' | 'phase' | 'loop';
  nodeIds: string[];
}

export interface Scene {
  schemaVersion: 2;
  id: string;
  space: SceneSpace;
  title: string;
  description: string;
  traceRef: string;
  sourceStepId?: string;
  groups?: SceneGroup[];
  nodes: SceneNode[];
  edges: SceneEdge[];
  legend: SceneLegendItem[];
  a11y: {
    altText: string;
    summary: string;
  };
}
