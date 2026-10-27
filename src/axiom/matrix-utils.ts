import type { StoredMatrix } from '../core/matrix.js';
import type { MatrixDraft } from '../workspace/types.js';

export function withShape<T extends { rows: number; cols: number }>(matrix: T): T & { shape: string } {
  return { ...matrix, shape: `${matrix.rows}×${matrix.cols}` };
}

export function nextMatrixName(objects: readonly StoredMatrix[]): string {
  const used = new Set(objects.map((matrix) => matrix.name));
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!used.has(letter)) return letter;
  }
  let index = 1;
  while (used.has(`M${index}`)) index += 1;
  return `M${index}`;
}

export function nextForkName(objects: readonly StoredMatrix[]): string {
  const used = new Set(objects.map((matrix) => matrix.name));
  let index = 1;
  while (used.has(`F${index}`)) index += 1;
  return `F${index}`;
}

export function makeId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceIdentifier(expression: string, oldName: string, newName: string): string {
  return expression.replace(
    new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(oldName)}(?![A-Za-z0-9_])`, 'g'),
    newName,
  );
}

export function draftToStored(draft: MatrixDraft, existing?: StoredMatrix): StoredMatrix {
  return withShape({
    id: draft.id ?? existing?.id ?? makeId(),
    name: draft.name,
    rows: draft.rows,
    cols: draft.cols,
    data: draft.data,
    note: draft.note || existing?.note || '自定义矩阵对象',
  });
}
