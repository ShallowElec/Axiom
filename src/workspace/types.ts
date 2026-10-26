import type { BlockAssembly, Matrix, StoredMatrix } from '../core/matrix.js';
import type { Q } from '../core/rational.js';

export type WorkspaceMatrix = StoredMatrix;

export interface MatrixDraft {
  id?: string;
  name: string;
  rows: number;
  cols: number;
  data: Q[][];
  note: string;
}

export interface BlockBuildPayload {
  name: string;
  grid: (Matrix | null)[][];
  built: BlockAssembly;
  rows: number;
  cols: number;
}

export interface ToastMessage {
  id: number;
  type: 'info' | 'error';
  message: string;
}
