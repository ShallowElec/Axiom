import { useEffect, useMemo, useState } from 'react';
import type { StoredMatrix } from '../../core/matrix.js';
import type { FormulaTemplate } from '../../content/library.js';
import type { DebugFunctionDefinition } from '../../debug/types.js';
import type { RunRecord } from '../../runtime/types.js';
import { Icon } from '../../components/Icons.js';
import type { ResourceMode } from './ActivityRail.js';

interface ResourceDockProps {
  mode: ResourceMode;
  objects: readonly StoredMatrix[];
  formulas: readonly FormulaTemplate[];
  algorithms: readonly DebugFunctionDefinition[];
  runs: readonly RunRecord[];
  activeRunId: string | null;
  onCreateMatrix: () => void;
  onOpenBlock: () => void;
  onEditMatrix: (matrix: StoredMatrix) => void;
  onInsertMatrix: (name: string) => void;
  onOpenFormula: (template: FormulaTemplate) => void;
  onOpenFormulaView: () => void;
  onOpenAlgorithm: (definition: DebugFunctionDefinition) => void;
  onOpenConsole: () => void;
  onOpenSyntax: () => void;
  onOpenRun: (runId: string) => void;
}

const META: Record<ResourceMode, { title: string; sub: string; empty: string }> = {
  objects: { title: 'OBJECTS', sub: '对象', empty: '还没有矩阵对象。新建一个，或从模板中选择。' },
  formulas: { title: 'FORMULAS', sub: '公式', empty: '没有匹配的公式模板。' },
  algorithms: { title: 'ALGORITHMS', sub: '算法', empty: '没有匹配的算法。' },
  runs: { title: 'RUNS', sub: '运行', empty: '还没有运行记录。按 F5 创建第一个 Run。' },
};

export default function ResourceDock({
  mode,
  objects,
  formulas,
  algorithms,
  runs,
  activeRunId,
  onCreateMatrix,
  onOpenBlock,
  onEditMatrix,
  onInsertMatrix,
  onOpenFormula,
  onOpenFormulaView,
  onOpenAlgorithm,
  onOpenConsole,
  onOpenSyntax,
  onOpenRun,
}: ResourceDockProps) {
  const [query, setQuery] = useState('');
  useEffect(() => { setQuery(''); }, [mode]);
  const meta = META[mode];
  const count = mode === 'objects' ? objects.length : mode === 'formulas' ? formulas.length : mode === 'algorithms' ? algorithms.length : runs.length;
  const normalized = query.trim().toLowerCase();

  const visibleObjects = useMemo(
    () => objects.filter((matrix) => !normalized || `${matrix.name} ${matrix.note}`.toLowerCase().includes(normalized)),
    [objects, normalized],
  );
  const visibleFormulas = useMemo(
    () => formulas.filter((template) => !normalized || `${template.title} ${template.formula} ${template.category}`.toLowerCase().includes(normalized)),
    [formulas, normalized],
  );
  const visibleAlgorithms = useMemo(
    () => algorithms.filter((algorithm) => !normalized || `${algorithm.name} ${algorithm.signature} ${algorithm.group}`.toLowerCase().includes(normalized)),
    [algorithms, normalized],
  );
  const visibleRuns = useMemo(
    () => [...runs].reverse().filter((run) => !normalized || `${run.id} ${run.expression} ${run.status}`.toLowerCase().includes(normalized)),
    [runs, normalized],
  );

  const headerAction = mode === 'objects'
    ? <button type="button" className="ax-row-icon" onClick={onCreateMatrix} title="New matrix" aria-label="New matrix"><Icon name="plus" size={14} /></button>
    : mode === 'formulas'
      ? <button type="button" className="ax-row-icon" onClick={onOpenFormulaView} title="Open structure lab" aria-label="Open structure lab"><Icon name="spark" size={14} /></button>
      : null;

  return (
    <aside className="ax-resource" aria-label={`${meta.sub}资源`}>
      <header className="ax-panel-head">
        <div className="ax-panel-title">
          <strong>{meta.title}</strong><span>{meta.sub} · {count}</span>
        </div>
        <div className="ax-panel-actions">{headerAction}</div>
      </header>

      <label className="ax-resource-search">
        <Icon name="compass" size={12} strokeWidth={1.5} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`SEARCH ${meta.title}`}
          aria-label={`Search ${meta.sub}`}
          spellCheck={false}
        />
      </label>

      <div className="ax-resource-list">
        {mode === 'objects' && visibleObjects.map((matrix) => (
          <div className="ax-object-row" key={matrix.id || matrix.name}>
            <button type="button" className="ax-object-main" onClick={() => onInsertMatrix(matrix.name)} title={`Insert ${matrix.name}`}>
              <span className="ax-object-name">{matrix.name}</span>
              <span className="ax-object-shape">{matrix.rows}×{matrix.cols}</span>
              <span className="ax-object-note">{matrix.note}</span>
            </button>
            <div className="ax-object-actions">
              <button type="button" className="ax-row-icon" onClick={() => onEditMatrix(matrix)} title={`Edit ${matrix.name}`} aria-label={`Edit ${matrix.name}`}>
                <Icon name="edit" size={13} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ))}

        {mode === 'formulas' && visibleFormulas.map((template) => (
          <div className="ax-formula-row" key={template.id}>
            <button type="button" className="ax-formula-main" onClick={() => onOpenFormula(template)} title={`Configure ${template.title}`}>
              <span className="ax-formula-symbol">{template.symbol}</span>
              <span className="ax-formula-title">{template.title}</span>
              <span className="ax-formula-family">{template.formula}</span>
            </button>
          </div>
        ))}

        {mode === 'algorithms' && visibleAlgorithms.map((algorithm) => (
          <div className="ax-algorithm-row" key={algorithm.id}>
            <button type="button" className="ax-algorithm-main" onClick={() => onOpenAlgorithm(algorithm)} title={algorithm.description}>
              <span className="ax-algorithm-signature">{algorithm.signature}</span>
              <span className="ax-algorithm-name">{algorithm.name}</span>
              <span className="ax-algorithm-group">{algorithm.group}</span>
            </button>
          </div>
        ))}

        {mode === 'runs' && visibleRuns.map((run) => (
          <div className={`ax-run-row ${run.id === activeRunId ? 'active' : ''}`} key={run.id}>
            <button type="button" className="ax-run-main" onClick={() => onOpenRun(run.id)} title={run.summary.title}>
              <span className="ax-run-name">{run.id}</span>
              <span className="ax-run-expression">{run.expression}</span>
              <span className="ax-run-meta">{run.status === 'failed' ? 'ERROR' : `${run.steps.length} STEPS`} · {run.provenance.toUpperCase()}</span>
            </button>
          </div>
        ))}

        {((mode === 'objects' && !visibleObjects.length) ||
          (mode === 'formulas' && !visibleFormulas.length) ||
          (mode === 'algorithms' && !visibleAlgorithms.length) ||
          (mode === 'runs' && !visibleRuns.length)) && (
          <div className="ax-resource-empty">{meta.empty}</div>
        )}
      </div>

      <footer className="ax-resource-footer">
        {mode === 'objects' && (
          <>
            <button type="button" className="ax-button primary tiny" onClick={onCreateMatrix}><Icon name="plus" size={11} /> MATRIX</button>
            <button type="button" className="ax-button tiny" onClick={onOpenBlock}><Icon name="grid" size={11} /> BLOCK</button>
          </>
        )}
        {mode === 'formulas' && (
          <button type="button" className="ax-button primary tiny" onClick={onOpenFormulaView}><Icon name="spark" size={11} /> STRUCTURE LAB</button>
        )}
        {mode === 'algorithms' && (
          <>
            <button type="button" className="ax-button primary tiny" onClick={onOpenConsole}><Icon name="terminal" size={11} /> CONSOLE</button>
            <button type="button" className="ax-button tiny" onClick={onOpenSyntax}><Icon name="book" size={11} /> SYNTAX</button>
          </>
        )}
        {mode === 'runs' && (
          <span className="ax-small-label">SESSION-ONLY / NOT SAVED</span>
        )}
      </footer>
    </aside>
  );
}
