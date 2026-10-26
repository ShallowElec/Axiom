import { analyzeExpression } from '../core/expression.js';
import type { ExpressionAnalysis } from '../core/expression.js';
import { libraryFrom } from '../content/library.js';
import type { StoredMatrix } from '../core/matrix.js';
import type { WorkbenchDocument } from './types.js';

export function analyzeObjectsExpression(
  objects: readonly StoredMatrix[],
  expression: string,
): ExpressionAnalysis {
  return analyzeExpression(expression, libraryFrom(objects));
}

export function analyzeWorkbenchDocument(doc: WorkbenchDocument): ExpressionAnalysis {
  return analyzeObjectsExpression(doc.objects, doc.expression);
}
