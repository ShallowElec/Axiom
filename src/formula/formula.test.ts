import { describe, expect, it } from 'vitest';

import {
  FORMULA_DOCUMENT_SCHEMA,
  FORMULA_DOCUMENT_VERSION,
  FORMULA_NODE_KINDS,
  FORMULA_SLOT_REGISTRY,
  SEMANTIC_CATEGORIES,
  SLOT_ROLES,
  FormulaValidationError,
  binderNode,
  callNode,
  createFormulaDocument,
  createFormulaNodeId,
  deserializeFormulaDocument,
  formulaDocumentToJSON,
  fractionNode,
  getFormulaChildEntries,
  getFormulaRoot,
  isFormulaDocument,
  isFormulaNode,
  listDocumentSlots,
  listNodeSlots,
  matrixNode,
  numberNode,
  operatorNode,
  parseFormulaDocumentJSON,
  referenceNode,
  scriptNode,
  serializeFormula,
  serializeFormulaDocument,
  slotNode,
  symbolNode,
  validateFormulaDocumentJSON,
  visitFormula,
  walkFormula,
} from './ast.js';
import type { FormulaDocument, FormulaNode, MatrixDelimiter } from './ast.js';
import {
  FORMULA_MACROS,
  escapeFormulaText,
  formulaToAltText,
  formulaToLatex,
  formulaToPlainLatex,
  isFormulaTrustedLatexCommand,
  renderFormula,
  renderFormulaToHtml,
} from './latex.js';
import {
  PALETTE_ITEMS,
  REQUIRED_PALETTE_IDS,
  SEMANTIC_COLORS,
  SEMANTIC_COLOR_TOKENS,
  getPaletteItem,
  listPaletteItems,
  paletteItemsByGroup,
} from './palette.js';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function identity2(): FormulaNode {
  return matrixNode([
    [numberNode('1'), numberNode('0')],
    [numberNode('0'), numberNode('1')],
  ]);
}

interface SampleFixture {
  readonly document: FormulaDocument;
  readonly root: FormulaNode;
}

/**
 * Exercises every node kind in one document:
 * fraction(script(matrix(symbol, slot, number, call(det, reference))) / binder).
 */
function sampleFixture(): SampleFixture {
  const matrix = matrixNode(
    [
      [symbolNode('A', { category: 'matrix', id: 'sym-A' }), slotNode('matrix-cell', { id: 'slot-cell', placeholder: '?' })],
      [
        numberNode('2', { id: 'num-2' }),
        callNode(
          'det',
          [referenceNode('external-B', { id: 'ref-B', label: 'B', category: 'matrix', target: 'external' })],
          { id: 'call-det' },
        ),
      ],
    ],
    { id: 'mat-1' },
  );
  const power = scriptNode(matrix, { id: 'script-1', sup: numberNode('2', { id: 'num-2b' }) });
  const sum = binderNode(
    'sum',
    [symbolNode('i', { category: 'index', id: 'sym-i' })],
    operatorNode(
      '\\odot',
      [
        symbolNode('x', { category: 'scalar', id: 'sym-x' }),
        symbolNode('y', { category: 'scalar', id: 'sym-y' }),
      ],
      { id: 'op-odot' },
    ),
    {
      id: 'binder-1',
      domain: {
        lower: numberNode('1', { id: 'num-1' }),
        upper: symbolNode('n', { category: 'index', id: 'sym-n' }),
      },
    },
  );
  const root = fractionNode(power, sum, { id: 'frac-root' });
  return { document: createFormulaDocument(root), root };
}

function sampleWire(): Record<string, unknown> {
  return JSON.parse(serializeFormulaDocument(sampleFixture().document)) as Record<string, unknown>;
}

function wireNodes(wire: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const nodes = wire.nodes;
  if (typeof nodes !== 'object' || nodes === null || Array.isArray(nodes)) {
    throw new Error('Fixture does not contain a node map');
  }
  const record = nodes as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`Fixture node ${key} is not an object`);
    }
  }
  return record as Record<string, Record<string, unknown>>;
}

function issueMessages(document: unknown): readonly string[] {
  const result = validateFormulaDocumentJSON(document);
  if (result.ok) return [];
  return result.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

function expectValidationFailure(document: unknown): void {
  const result = validateFormulaDocumentJSON(document);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  expect(() => parseFormulaDocumentJSON(document)).toThrow(FormulaValidationError);
}

/* ------------------------------------------------------------------ *
 * Construction and tree helpers
 * ------------------------------------------------------------------ */

describe('formula AST construction', () => {
  it('constructs symbols, numbers, operators and a stable-id document', () => {
    const A = symbolNode('A', { category: 'matrix', id: 'sym-a' });
    const B = symbolNode('B', { category: 'matrix', id: 'sym-b' });
    const sum = operatorNode('+', [A, B], { id: 'op-plus' });

    expect(sum.kind).toBe('operator');
    expect(sum.fixity).toBe('infix');
    expect(sum.category).toBe('matrix');
    expect(sum.operands.map((operand) => operand.id)).toEqual(['sym-a', 'sym-b']);
    expect(isFormulaNode(sum)).toBe(true);

    const document = createFormulaDocument(sum);
    expect(isFormulaDocument(document)).toBe(true);
    expect(document.schema).toBe(FORMULA_DOCUMENT_SCHEMA);
    expect(document.version).toBe(FORMULA_DOCUMENT_VERSION);
    expect(document.rootId).toBe(sum.id);
    expect(Object.keys(document.nodes).sort()).toEqual(['op-plus', 'sym-a', 'sym-b']);
    expect(getFormulaRoot(document)).toBe(sum);
    expect(createFormulaDocument(getFormulaRoot(document)).rootId).toBe(document.rootId);
  });

  it('infers categories for fractions, scripts and transpose', () => {
    const numericFraction = fractionNode(numberNode('1'), numberNode('2'));
    expect(numericFraction.category).toBe('number');
    const scalarFraction = fractionNode(
      symbolNode('x', { category: 'scalar' }),
      numberNode('2'),
    );
    expect(scalarFraction.category).toBe('scalar');

    const matrix = identity2();
    const power = scriptNode(matrix, { sup: numberNode('2') });
    expect(power.category).toBe('matrix');
    const transpose = operatorNode('transpose', [matrix]);
    expect(transpose.category).toBe('matrix');
    expect(transpose.fixity).toBe('postfix');
  });

  it('constructs binders with structured domains and default categories', () => {
    const variable = symbolNode('i', { category: 'index' });
    const body = symbolNode('x', { category: 'scalar' });
    const sum = binderNode('sum', [variable], body, {
      domain: { lower: numberNode('1'), upper: numberNode('10') },
    });
    expect(sum.category).toBe('bound');
    expect(sum.binder).toBe('sum');
    expect(sum.domain?.lower?.kind).toBe('number');
    expect(sum.domain?.upper?.kind).toBe('number');

    const lambda = binderNode('lambda', [variable], body);
    expect(lambda.category).toBe('function');
    expect(lambda.domain).toBeUndefined();
  });

  it('constructs typed slots, references, and fresh ids', () => {
    const slot = slotNode('operand', { placeholder: '?' });
    expect(slot.category).toBe('unknown');
    expect(slot.accepts).toContain('matrix');
    expect(slot.policy).toBe('replace');
    expect(slot.required).toBe(true);

    const superscript = slotNode('superscript');
    expect(superscript.required).toBe(false);
    expect(superscript.policy).toBe('insert');

    const reference = referenceNode('external-object', {
      label: 'matrix B',
      category: 'matrix',
    });
    expect(reference.target).toBe('external');
    expect(reference.label).toBe('matrix B');

    const first = createFormulaNodeId('test');
    const second = createFormulaNodeId('test');
    expect(first).toMatch(/^test_[a-z0-9]+$/);
    expect(second).not.toBe(first);
  });

  it('rejects malformed or injection-shaped construction', () => {
    expect(() => symbolNode('\\href{javascript:alert(1)}{A}')).toThrow();
    expect(() => symbolNode('A B')).toThrow();
    expect(() => numberNode('1/2')).toThrow();
    expect(() => numberNode('NaN')).toThrow();
    expect(() => operatorNode('+', [identity2()])).toThrow();
    expect(() => scriptNode(identity2())).toThrow();
    expect(() => matrixNode([])).toThrow();
    expect(() => matrixNode([[numberNode('1')], [numberNode('2'), numberNode('3')]])).toThrow();
    expect(() => binderNode('sum', [], numberNode('1'))).toThrow();
    expect(() => slotNode('operand', { accepts: [] })).toThrow();
    expect(() => slotNode('operand', { accepts: ['matrix', 'matrix'] })).toThrow();
    expect(() => referenceNode('bad id" onmouseover="x')).toThrow();
    expect(() => numberNode('1', { id: 'bad id' })).toThrow();
  });

  it('rejects duplicate ids in a document and dangling node references', () => {
    const first = symbolNode('A', { id: 'same-id' });
    const second = symbolNode('B', { id: 'same-id' });
    expect(() => createFormulaDocument(operatorNode('+', [first, second]))).toThrow(/Duplicate/);

    const target = symbolNode('A', { id: 'target-id' });
    const dangling = referenceNode('target-id', { target: 'node', label: 'A' });
    expect(() => createFormulaDocument(dangling)).toThrow(/missing document node/);
    expect(createFormulaDocument(operatorNode('+', [target, dangling])).rootId).toBeTruthy();
  });

  it('exposes child paths and traversal contexts', () => {
    const fraction = fractionNode(
      scriptNode(symbolNode('A'), { sub: symbolNode('i'), sup: numberNode('2') }),
      identity2(),
    );
    const entries = getFormulaChildEntries(fraction);
    expect(entries.map((entry) => [entry.path, entry.role])).toEqual([
      ['numerator', 'numerator'],
      ['denominator', 'denominator'],
    ]);

    const visitedPaths: string[] = [];
    const matrixChildren: string[] = [];
    visitFormula(fraction, (node, context) => {
      visitedPaths.push(`${context.path}:${node.kind}`);
      if (node.kind === 'matrix') {
        matrixChildren.push(...getFormulaChildEntries(node).map((entry) => entry.path));
        return false;
      }
      return undefined;
    });

    expect(visitedPaths[0]).toBe('$:fraction');
    expect(visitedPaths).toContain('$.numerator:script');
    expect(visitedPaths).toContain('$.numerator.base:symbol');
    expect(visitedPaths).toContain('$.numerator.sub:symbol');
    expect(visitedPaths).toContain('$.denominator:matrix');
    expect(visitedPaths.some((path) => path.includes('rows[0][0]'))).toBe(false);
    expect(matrixChildren).toEqual(['rows[0][0]', 'rows[0][1]', 'rows[1][0]', 'rows[1][1]']);
    expect(walkFormula).toBe(visitFormula);

    const kinds: string[] = [];
    walkFormula(symbolNode('A'), (node) => {
      kinds.push(node.kind);
    });
    expect(kinds).toEqual(['symbol']);
  });
});

/* ------------------------------------------------------------------ *
 * Slot registry and enumeration
 * ------------------------------------------------------------------ */

describe('typed slots and registry', () => {
  it('declares a static slot contract for every child-bearing node kind', () => {
    expect(FORMULA_SLOT_REGISTRY.fraction.map((entry) => entry.key)).toEqual([
      'numerator',
      'denominator',
    ]);
    expect(FORMULA_SLOT_REGISTRY.script.map((entry) => [entry.key, entry.required, entry.policy])).toEqual([
      ['base', true, 'replace'],
      ['sub', false, 'insert'],
      ['sup', false, 'insert'],
    ]);
    expect(FORMULA_SLOT_REGISTRY.operator[0]?.key).toBe('operands[]');
    expect(FORMULA_SLOT_REGISTRY.operator[0]?.accepts).toContain('matrix');
    expect(FORMULA_SLOT_REGISTRY.binder.map((entry) => entry.key)).toEqual([
      'vars[]',
      'body',
      'domain.lower',
      'domain.upper',
      'domain.over',
    ]);
    expect(FORMULA_SLOT_REGISTRY.matrix[0]?.role).toBe('matrix-cell');
    expect(FORMULA_SLOT_REGISTRY.slot).toEqual([]);
    expect(FORMULA_SLOT_REGISTRY.symbol).toEqual([]);
    for (const kind of FORMULA_NODE_KINDS) {
      expect(FORMULA_SLOT_REGISTRY[kind]).toBeDefined();
    }
    for (const role of SLOT_ROLES) {
      expect(typeof role).toBe('string');
    }
  });

  it('enumerates occupied and empty positions for a single node', () => {
    const base = symbolNode('A', { category: 'matrix' });
    const script = scriptNode(base, { sup: numberNode('2') });
    const scriptSlots = listNodeSlots(script);
    expect(scriptSlots.map((slot) => slot.path)).toEqual(['base', 'sub', 'sup']);
    expect(scriptSlots[0]?.occupied).toBe(true);
    expect(scriptSlots[1]?.occupied).toBe(false);
    expect(scriptSlots[2]?.occupied).toBe(true);
    expect(scriptSlots[1]?.accepts).toContain('index');
    expect(scriptSlots[1]?.policy).toBe('insert');

    const cells = matrixNode([
      [slotNode('matrix-cell'), slotNode('matrix-cell')],
      [numberNode('1'), slotNode('matrix-cell')],
    ]);
    const matrixSlots = listNodeSlots(cells);
    expect(matrixSlots.map((slot) => slot.path)).toEqual([
      'rows[0][0]',
      'rows[0][1]',
      'rows[1][0]',
      'rows[1][1]',
    ]);
    expect(matrixSlots[0]?.childIsSlot).toBe(true);
    expect(matrixSlots[2]?.childIsSlot).toBe(false);
    expect(matrixSlots.every((slot) => slot.role === 'matrix-cell')).toBe(true);

    const binder = binderNode(
      'sum',
      [symbolNode('i', { category: 'index' })],
      slotNode('binder-body'),
      { domain: { lower: numberNode('1'), upper: numberNode('9') } },
    );
    const binderSlots = listNodeSlots(binder);
    expect(binderSlots.map((slot) => [slot.path, slot.occupied])).toEqual([
      ['vars[0]', true],
      ['body', true],
      ['domain.lower', true],
      ['domain.upper', true],
      ['domain.over', false],
    ]);
    expect(binderSlots[1]?.childIsSlot).toBe(true);
  });

  it('enumerates nested slots across a document and keeps hole contracts accessible', () => {
    const fraction = fractionNode(
      slotNode('numerator', { accepts: ['scalar', 'number'], policy: 'wrap' }),
      matrixNode([[slotNode('matrix-cell'), numberNode('2')]]),
    );
    const slots = listNodeSlots(fraction);
    expect(slots).toHaveLength(2);
    const numerator = slots[0];
    expect(numerator?.childIsSlot).toBe(true);
    expect(numerator?.child?.kind).toBe('slot');
    expect(numerator?.policy).toBe('replace');

    const document = createFormulaDocument(fraction);
    const documentSlots = listDocumentSlots(document);
    expect(documentSlots.some((slot) => slot.path === 'numerator')).toBe(true);
    expect(documentSlots.some((slot) => slot.path === 'rows[0][0]')).toBe(true);
    expect(documentSlots.length).toBeGreaterThanOrEqual(3);
  });
});

/* ------------------------------------------------------------------ *
 * JSON serialization and validation
 * ------------------------------------------------------------------ */

describe('formula document JSON', () => {
  it('round-trips a full AST through the flat wire format', () => {
    const fixture = sampleFixture();
    const wire = formulaDocumentToJSON(fixture.document);
    const rootJson = wire.nodes[fixture.document.rootId];
    expect(rootJson?.kind).toBe('fraction');
    if (rootJson?.kind === 'fraction') {
      expect(typeof rootJson.numerator).toBe('string');
      expect(wire.nodes[rootJson.numerator]?.kind).toBe('script');
    }

    const matrixJson = wire.nodes['mat-1'];
    expect(matrixJson?.kind).toBe('matrix');
    if (matrixJson?.kind === 'matrix') {
      expect(matrixJson.rows[0]?.[0]).toBe('sym-A');
      expect(matrixJson.rows[1]?.[1]).toBe('call-det');
    }

    const text = serializeFormulaDocument(fixture.document);
    const parsed = deserializeFormulaDocument(text);
    expect(parsed).toEqual(fixture.document);
    expect(serializeFormulaDocument(parsed)).toBe(text);
    expect(parseFormulaDocumentJSON(JSON.parse(text) as unknown)).toEqual(fixture.document);
    expect(serializeFormula(fixture.root)).toBe(text);
  });

  it('rejects malformed documents with pathful validation issues', () => {
    const versionWire = sampleWire();
    versionWire.version = 99;
    expectValidationFailure(versionWire);
    expect(issueMessages(versionWire).some((message) => message.includes('$.version'))).toBe(true);

    const missingChild = sampleWire();
    delete wireNodes(missingChild)['sym-A'];
    expectValidationFailure(missingChild);

    const badCategory = sampleWire();
    const badCategorySlot = wireNodes(badCategory)['slot-cell'];
    if (badCategorySlot !== undefined) badCategorySlot.category = 'matrix';
    expectValidationFailure(badCategory);

    const badMatrix = sampleWire();
    const badMatrixNode = wireNodes(badMatrix)['mat-1'];
    if (badMatrixNode !== undefined) badMatrixNode.rows = [];
    expectValidationFailure(badMatrix);

    const badReference = sampleWire();
    const badReferenceNode = wireNodes(badReference)['ref-B'];
    if (badReferenceNode !== undefined) {
      badReferenceNode.target = 'node';
      badReferenceNode.targetId = 'missing-node';
    }
    expectValidationFailure(badReference);

    const unexpectedField = sampleWire();
    const symbolNodeJson = wireNodes(unexpectedField)['sym-A'];
    if (symbolNodeJson !== undefined) symbolNodeJson.injected = true;
    expectValidationFailure(unexpectedField);

    const wrongMapKey = sampleWire();
    const wrongMapKeyNodes = wireNodes(wrongMapKey);
    const firstKey = Object.keys(wrongMapKeyNodes)[0];
    if (firstKey !== undefined) {
      const firstNode = wrongMapKeyNodes[firstKey];
      if (firstNode !== undefined) firstNode.id = 'different-id';
    }
    expectValidationFailure(wrongMapKey);
  });

  it('rejects cycles, invalid ids, and unsupported JSON shapes', () => {
    const cyclic = {
      schema: FORMULA_DOCUMENT_SCHEMA,
      version: FORMULA_DOCUMENT_VERSION,
      rootId: 'node-a',
      nodes: {
        'node-a': {
          id: 'node-a',
          kind: 'fraction',
          category: 'scalar',
          numerator: 'node-b',
          denominator: 'node-a',
        },
        'node-b': {
          id: 'node-b',
          kind: 'symbol',
          category: 'scalar',
          name: 'x',
          variant: 'italic',
        },
      },
    };
    expectValidationFailure(cyclic);
    expect(issueMessages(cyclic).some((message) => message.includes('Cycle'))).toBe(true);

    const invalidId = {
      schema: FORMULA_DOCUMENT_SCHEMA,
      version: FORMULA_DOCUMENT_VERSION,
      rootId: 'x',
      nodes: {
        x: { id: 'x', kind: 'symbol', category: 'scalar', name: 'x', variant: 'italic' },
        'bad id': { id: 'bad id', kind: 'symbol', category: 'scalar', name: 'y', variant: 'italic' },
      },
    };
    expectValidationFailure(invalidId);

    expect(validateFormulaDocumentJSON(null).ok).toBe(false);
    expect(validateFormulaDocumentJSON('not a document').ok).toBe(false);
    expect(validateFormulaDocumentJSON({}).ok).toBe(false);
    expect(validateFormulaDocumentJSON({ nodes: [] }).ok).toBe(false);

    let syntaxIssue: FormulaValidationError | undefined;
    try {
      deserializeFormulaDocument('{"schema":');
    } catch (error) {
      if (error instanceof FormulaValidationError) syntaxIssue = error;
    }
    expect(syntaxIssue).toBeInstanceOf(FormulaValidationError);
    expect(syntaxIssue?.issues[0]?.path).toBe('$');
  });

  it('accepts a minimal valid document and preserves id-keyed sharing', () => {
    const shared = symbolNode('A', { id: 'shared-symbol', category: 'matrix' });
    const root = operatorNode('+', [shared, shared], { id: 'plus-root' });
    const document = createFormulaDocument(root);
    expect(Object.keys(document.nodes)).toHaveLength(2);
    const ready = deserializeFormulaDocument(serializeFormulaDocument(document));
    expect(ready).toEqual(document);
    const readyRoot = ready.nodes[ready.rootId];
    expect(readyRoot?.kind).toBe('operator');
    if (readyRoot?.kind === 'operator') {
      expect(readyRoot.operands[0]).toBe(readyRoot.operands[1]);
    }
  });
});

/* ------------------------------------------------------------------ *
 * LaTeX and alt text
 * ------------------------------------------------------------------ */

describe('LaTeX serialization', () => {
  it('serializes every core node kind to plain LaTeX', () => {
    const A = symbolNode('A', { category: 'matrix' });
    const B = symbolNode('B', { category: 'matrix' });
    const C = symbolNode('C', { category: 'matrix' });
    const sum = operatorNode('+', [A, B]);
    expect(formulaToPlainLatex(sum)).toBe('A + B');
    expect(formulaToPlainLatex(fractionNode(numberNode('1'), numberNode('2')))).toBe('\\frac{1}{2}');
    expect(formulaToPlainLatex(scriptNode(A, { sup: numberNode('2') }))).toBe('A^{2}');
    expect(formulaToPlainLatex(operatorNode('transpose', [A]))).toBe('A^{\\top}');
    expect(formulaToPlainLatex(operatorNode('inverse', [A]))).toBe('A^{-1}');
    expect(formulaToPlainLatex(callNode('det', [A]))).toBe('\\det\\left(A\\right)');
    expect(formulaToPlainLatex(callNode('solve', [A, B]))).toBe(
      '\\operatorname{solve}\\left(A, B\\right)',
    );
    expect(
      formulaToPlainLatex(
        matrixNode([
          [numberNode('1'), numberNode('2')],
          [numberNode('3'), numberNode('4')],
        ]),
      ),
    ).toBe('\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}');
    expect(formulaToPlainLatex(referenceNode('external-A', { label: 'A' }))).toBe(
      '\\text{A}',
    );
    expect(formulaToPlainLatex(slotNode('operand'))).toBe('\\square');
    expect(formulaToPlainLatex(numberNode('1e-3'))).toBe('1\\times 10^{-3}');
    expect(
      formulaToPlainLatex(operatorNode('\\times', [sum, C])),
    ).toBe('\\left(A + B\\right) \\times C');
  });

  it('serializes sum, integral and lambda binders', () => {
    const i = symbolNode('i', { category: 'index' });
    const n = symbolNode('n', { category: 'index' });
    const body = symbolNode('x', { category: 'scalar' });
    const sum = binderNode('sum', [i], body, {
      domain: { lower: numberNode('1'), upper: n },
    });
    expect(formulaToPlainLatex(sum)).toBe('\\sum_{i = 1}^{n} x');

    const integral = binderNode('int', [i], body, {
      domain: { lower: numberNode('0'), upper: numberNode('1') },
    });
    expect(formulaToPlainLatex(integral)).toContain('\\int_{i = 0}^{1}');

    const lambda = binderNode('lambda', [i], body, {
      domain: { over: symbolNode('S', { category: 'matrix' }) },
    });
    expect(formulaToPlainLatex(lambda)).toBe('\\lambda i \\in S.\\, x');
  });

  it('emits deterministic, allowlisted semantic annotations on demand', () => {
    const root = operatorNode('+', [
      symbolNode('A', { category: 'matrix', id: 'sym-a' }),
      symbolNode('B', { category: 'matrix', id: 'sym-b' }),
    ], { id: 'op-plus' });
    const document = createFormulaDocument(root);

    const plain = formulaToLatex(document);
    expect(plain).toBe('A + B');
    expect(plain).not.toContain('\\htmlClass');

    const annotated = formulaToLatex(document, { annotateNodes: true });
    expect(annotated).toContain('\\htmlClass{formula-node formula-node--operator formula-category--matrix}');
    expect(annotated).toContain('formula-id=op-plus');
    expect(annotated).toContain('formula-id=sym-a');
    expect(annotated).toContain('\\htmlData{formula-id=sym-b,formula-kind=symbol,formula-category=matrix}');
    expect(formulaToPlainLatex(document)).toBe(plain);
    expect(renderFormula(document).latex).toContain('\\htmlClass');
  });

  it('produces human-readable alt text', () => {
    const A = symbolNode('A', { category: 'matrix' });
    const B = symbolNode('B', { category: 'matrix' });
    expect(formulaToAltText(operatorNode('+', [A, B]))).toBe('A plus B');
    expect(formulaToAltText(callNode('det', [A]))).toBe('determinant(A)');
    expect(formulaToAltText(fractionNode(numberNode('1'), numberNode('2')))).toBe('1 over 2');
    expect(
      formulaToAltText(
        matrixNode([
          [numberNode('1'), numberNode('2')],
          [numberNode('3'), numberNode('4')],
        ]),
      ),
    ).toContain('matrix with 2 rows and 2 columns');
    const sum = binderNode(
      'sum',
      [symbolNode('i', { category: 'index' })],
      symbolNode('i', { category: 'index' }),
      { domain: { lower: numberNode('1'), upper: symbolNode('n', { category: 'index' }) } },
    );
    expect(formulaToAltText(sum)).toContain('sum over i from 1 to n');
    expect(formulaToAltText(slotNode('matrix-cell'))).toContain('matrix cell slot');
    expect(formulaToAltText(referenceNode('r', { label: 'R' }))).toBe('reference to R');
  });

  it('serializes all matrix delimiter variants', () => {
    const environments: readonly [MatrixDelimiter, string][] = [
      ['bracket', 'bmatrix'],
      ['paren', 'pmatrix'],
      ['brace', 'Bmatrix'],
      ['bar', 'vmatrix'],
      ['double-bar', 'Vmatrix'],
      ['none', 'matrix'],
    ];
    for (const [delimiter, environment] of environments) {
      const latex = formulaToPlainLatex(
        matrixNode([[numberNode('1')]], { delimiters: delimiter }),
      );
      expect(latex).toBe(`\\begin{${environment}}1\\end{${environment}}`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * KaTeX rendering and security
 * ------------------------------------------------------------------ */

describe('KaTeX rendering and safety', () => {
  it('renders the complete AST with HTML and MathML', () => {
    const fixture = sampleFixture();
    const rendered = renderFormula(fixture.document, { annotateNodes: true });
    expect(rendered.html).toContain('class="katex"');
    expect(rendered.html).toContain('<math');
    expect(rendered.html).toContain('data-formula-id');
    expect(rendered.latex).toContain('\\htmlClass');
    expect(rendered.altText.length).toBeGreaterThan(0);

    const html = renderFormulaToHtml(fixture.root, { displayMode: true });
    expect(html).toContain('katex-display');
    expect(html).toContain('class="katex"');

    const unannotated = renderFormulaToHtml(fixture.document, { annotateNodes: false });
    expect(unannotated).not.toContain('data-formula-id');
    expect(unannotated).not.toContain('formula-node');
    expect(unannotated).toContain('<math');
  });

  it('renders every palette template, annotated and plain', () => {
    for (const item of PALETTE_ITEMS) {
      const template = item.create();
      expect(() => renderFormulaToHtml(template, { annotateNodes: true }), item.id).not.toThrow();
      expect(() => renderFormulaToHtml(template, { annotateNodes: false }), item.id).not.toThrow();
    }
  });

  it('only trusts its own annotation commands, never links, style, or ids', () => {
    expect(
      isFormulaTrustedLatexCommand({
        command: '\\htmlClass',
        class: 'formula-node formula-node--matrix formula-category--matrix',
      }),
    ).toBe(true);
    expect(
      isFormulaTrustedLatexCommand({
        command: '\\htmlClass',
        class: 'rogue-class',
      }),
    ).toBe(false);
    expect(
      isFormulaTrustedLatexCommand({
        command: '\\htmlClass',
        class: 'formula-node onclick=alert(1)',
      }),
    ).toBe(false);
    expect(
      isFormulaTrustedLatexCommand({
        command: '\\htmlData',
        attributes: {
          'data-formula-id': 'sym-a',
          'data-formula-kind': 'symbol',
          'data-formula-category': 'matrix',
        },
      }),
    ).toBe(true);
    expect(
      isFormulaTrustedLatexCommand({
        command: '\\htmlData',
        attributes: { 'data-onclick': 'alert(1)' },
      }),
    ).toBe(false);
    expect(
      isFormulaTrustedLatexCommand({
        command: '\\htmlData',
        attributes: { 'data-formula-id': 'x" onmouseover="alert(1)' },
      }),
    ).toBe(false);
    expect(isFormulaTrustedLatexCommand({ command: '\\href', url: 'javascript:alert(1)' })).toBe(false);
    expect(isFormulaTrustedLatexCommand({ command: '\\href', url: 'https://example.com' })).toBe(false);
    expect(isFormulaTrustedLatexCommand({ command: '\\url', url: 'https://example.com' })).toBe(false);
    expect(isFormulaTrustedLatexCommand({ command: '\\includegraphics', url: 'file.png' })).toBe(false);
    expect(isFormulaTrustedLatexCommand({ command: '\\htmlStyle', style: 'color:red' })).toBe(false);
    expect(isFormulaTrustedLatexCommand({ command: '\\htmlId', id: 'root' })).toBe(false);
  });

  it('escapes hostile reference labels and text slots instead of executing them', () => {
    const hostileLabel = '\\href{javascript:alert(1)}{click} <img src=x onerror=alert(1)>';
    const reference = referenceNode('external-x', { label: hostileLabel, category: 'matrix' });
    const latex = formulaToPlainLatex(reference);
    expect(latex).toContain('\\text{');
    expect(latex).not.toContain('\\href');
    expect(latex).not.toContain('\\htmlStyle');
    expect(latex).toContain('\u2216href');

    const html = renderFormulaToHtml(reference, { annotateNodes: true });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain('data-formula-id');

    const placeholder = slotNode('operand', { placeholder: '<script>alert(1)</script>' });
    const placeholderHtml = renderFormulaToHtml(placeholder);
    expect(placeholderHtml).not.toContain('<script>alert(1)</script>');
    const escaped = escapeFormulaText('a\\b{c}');
    expect(escaped).not.toContain('\\b');
    expect(escaped).toContain('\u2216b');
    expect(escaped).toContain('\\{c\\}');
  });

  it('rejects LaTeX injection through symbol names', () => {
    expect(() => symbolNode('\\href{javascript:alert(1)}{A}')).toThrow();
    expect(() => symbolNode('A_{1}')).toThrow();
    expect(() => symbolNode('α; \\htmlStyle{color:red}')).toThrow();
    expect(() => referenceNode('safe', { label: 'ok', target: 'node' })).not.toThrow();
  });

  it('uses a limited macro set', () => {
    expect(Object.keys(FORMULA_MACROS).length).toBeGreaterThan(0);
    expect(Object.keys(FORMULA_MACROS).length).toBeLessThanOrEqual(16);
    expect(FORMULA_MACROS['\\R']).toBe('\\mathbb{R}');
    expect(FORMULA_MACROS['\\href']).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

describe('typed palette catalogue', () => {
  it('contains all required linear-algebra entries with unique ids', () => {
    const ids = PALETTE_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of REQUIRED_PALETTE_IDS) {
      expect(getPaletteItem(id), id).toBeDefined();
    }
    expect(getPaletteItem('binder-sum')?.group).toBe('binder');
    expect(getPaletteItem('operator-gradient')?.future).toBe(true);
    expect(getPaletteItem('operator-partial')?.future).toBe(true);
    expect(getPaletteItem('function-det')?.category).toBe('function');
    expect(getPaletteItem('matrix-2x2')?.category).toBe('matrix');
    expect(getPaletteItem('slot-any')?.category).toBe('unknown');
  });

  it('builds a valid AST, JSON document, and KaTeX render for every item', () => {
    for (const item of PALETTE_ITEMS) {
      expect(item.label.length, item.id).toBeGreaterThan(0);
      expect(item.description.length, item.id).toBeGreaterThan(0);
      expect(item.keywords.length, item.id).toBeGreaterThan(0);
      expect(SEMANTIC_CATEGORIES, item.id).toContain(item.category);
      expect(['replace', 'insert', 'wrap', 'reject'], item.id).toContain(item.dropPolicy);

      const first = item.create();
      const second = item.create();
      expect(first.id, item.id).not.toBe(second.id);
      expect(item.output.nodeKind, item.id).toBe(first.kind);
      expect(item.output.category, item.id).toBe(first.category);
      expect(item.output.latex, item.id).toBe(formulaToPlainLatex(first));
      expect(item.output.altText, item.id).toBe(formulaToAltText(first));
      expect(item.output.latex.length, item.id).toBeGreaterThan(0);
      expect(item.output.altText.length, item.id).toBeGreaterThan(0);

      const document = createFormulaDocument(first);
      const wire = formulaDocumentToJSON(document);
      const validation = validateFormulaDocumentJSON(wire);
      expect(validation.ok, `${item.id}: ${issueMessages(wire).join('; ')}`).toBe(true);
      expect(() => deserializeFormulaDocument(serializeFormulaDocument(document)), item.id).not.toThrow();
      expect(() => renderFormulaToHtml(document, { annotateNodes: true }), item.id).not.toThrow();
      expect(() => renderFormulaToHtml(document, { annotateNodes: false }), item.id).not.toThrow();
    }
  });

  it('keeps templates editable with typed holes', () => {
    const matrix = getPaletteItem('matrix-2x2')?.create();
    expect(matrix?.kind).toBe('matrix');
    if (matrix?.kind === 'matrix') {
      expect(matrix.rows).toHaveLength(2);
      expect(matrix.rows.every((row) => row.length === 2)).toBe(true);
      expect(matrix.rows.flat().every((cell) => cell.kind === 'slot')).toBe(true);
    }

    const det = getPaletteItem('function-det')?.create();
    expect(det?.kind).toBe('call');
    if (det?.kind === 'call') {
      expect(det.name).toBe('det');
      expect(det.args[0]?.kind).toBe('slot');
      expect(det.args[0]?.category).toBe('unknown');
      if (det.args[0]?.kind === 'slot') {
        expect(det.args[0].accepts).toContain('matrix');
        expect(det.args[0].accepts).not.toContain('number');
      }
    }

    const sum = getPaletteItem('binder-sum')?.create();
    expect(sum?.kind).toBe('binder');
    if (sum?.kind === 'binder') {
      expect(sum.binder).toBe('sum');
      expect(sum.vars).toHaveLength(1);
      expect(sum.body.kind).toBe('slot');
      expect(sum.domain?.lower?.kind).toBe('number');
      expect(sum.domain?.upper?.kind).toBe('symbol');
    }

    const fraction = getPaletteItem('structure-fraction')?.create();
    expect(fraction?.kind).toBe('fraction');
    if (fraction?.kind === 'fraction') {
      expect(fraction.numerator.kind).toBe('slot');
      expect(fraction.denominator.kind).toBe('slot');
    }

    const power = getPaletteItem('structure-power')?.create();
    expect(power?.kind).toBe('script');
    if (power?.kind === 'script') {
      expect(power.sup?.kind).toBe('slot');
    }
  });

  it('offers grouping, filtering, and future markers', () => {
    const grouped = paletteItemsByGroup();
    expect(Object.values(grouped).reduce((sum, items) => sum + items.length, 0)).toBe(
      PALETTE_ITEMS.length,
    );
    for (const group of Object.keys(grouped) as (keyof typeof grouped)[]) {
      expect(grouped[group].every((item) => item.group === group)).toBe(true);
    }
    expect(listPaletteItems({ group: 'function' }).map((item) => item.id)).toContain('function-det');
    expect(listPaletteItems({ category: 'matrix' }).every((item) => item.category === 'matrix')).toBe(true);
    const present = listPaletteItems({ includeFuture: false });
    expect(present.some((item) => item.future === true)).toBe(false);
    expect(present.length).toBeLessThan(PALETTE_ITEMS.length);
  });

  it('defines semantic CSS variable tokens for every category', () => {
    for (const category of SEMANTIC_CATEGORIES) {
      expect(SEMANTIC_COLOR_TOKENS[category]).toBe(`--formula-color-${category}`);
      expect(SEMANTIC_COLORS[category]).toBe(`var(--formula-color-${category})`);
    }
    expect(Object.keys(SEMANTIC_COLORS)).toHaveLength(SEMANTIC_CATEGORIES.length);
  });

  it('uses immutable helper APIs without reusing template nodes', () => {
    const item = getPaletteItem('matrix-2x2');
    expect(item).toBeDefined();
    if (item === undefined) return;
    const first = item.create();
    const second = item.create();
    expect(first).not.toBe(second);
    if (first.kind === 'matrix' && second.kind === 'matrix') {
      expect(first.rows[0]?.[0]).not.toBe(second.rows[0]?.[0]);
    }
    const firstDocument = createFormulaDocument(first);
    const secondDocument = createFormulaDocument(second);
    expect(firstDocument.rootId).not.toBe(secondDocument.rootId);
    expect(firstDocument.nodes[first.id]).toBe(first);
    expect(secondDocument.nodes[second.id]).toBe(second);
  });
});
