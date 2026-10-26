import { useEffect, useMemo, useState } from 'react';
import type { JsonValue } from '../../core/protocol.js';
import type { Matrix, StoredMatrix } from '../../core/matrix.js';
import { formatNumber } from '../../core/rational.js';
import { libraryFrom } from '../../content/library.js';
import { DEBUG_FUNCTIONS, debugFunctionById, runDebugFunction } from '../../debug/registry.js';
import type { DebugRunResult } from '../../debug/types.js';
import type { Story } from '../../presentation/storyTypes.js';
import { Icon } from '../../components/Icons.js';

interface ConsolePanelProps {
  matrices: readonly StoredMatrix[];
  selectedFunctionId: string;
  onSelectFunction: (id: string) => void;
  onOpenStory: (story: Story) => void;
}

function MatrixReadout({ matrix }: { matrix: Matrix }) {
  return (
    <div className="ax-debug-matrix" style={{ gridTemplateColumns: `repeat(${matrix.cols}, minmax(22px, 1fr))` }}>
      {matrix.data.map((row, rowIndex) =>
        row.map((value, colIndex) => (
          <span key={`${rowIndex},${colIndex}`}>{formatNumber(value)}</span>
        )),
      )}
    </div>
  );
}

export default function ConsolePanel({ matrices, selectedFunctionId, onSelectFunction, onOpenStory }: ConsolePanelProps) {
  const definition = useMemo(
    () => debugFunctionById(selectedFunctionId) ?? DEBUG_FUNCTIONS[0]!,
    [selectedFunctionId],
  );
  const [args, setArgs] = useState(() => JSON.stringify(definition.defaults, null, 2));
  const [result, setResult] = useState<DebugRunResult | null>(null);
  const [argError, setArgError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setArgs(JSON.stringify(definition.defaults, null, 2));
    setResult(null);
    setArgError(null);
  }, [definition]);

  const visibleFunctions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return DEBUG_FUNCTIONS.filter((item) => !query || `${item.name} ${item.signature} ${item.group}`.toLowerCase().includes(query));
  }, [search]);

  const execute = (): void => {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('ARGS must be a JSON object.');
      }
      setArgError(null);
      setResult(runDebugFunction(definition, parsed as Record<string, JsonValue>, {
        matrices,
        library: libraryFrom(matrices),
      }));
    } catch (error) {
      setArgError(error instanceof Error ? error.message : 'Cannot parse JSON.');
    }
  };

  return (
    <div className="ax-console">
      <aside className="ax-console-side">
        <label className="ax-resource-search" style={{ margin: '0 0 6px' }}>
          <Icon name="compass" size={11} strokeWidth={1.5} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SEARCH FUNCTIONS" spellCheck={false} />
        </label>
        <div className="ax-function-list">
          {visibleFunctions.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`ax-function-item ${item.id === definition.id ? 'active' : ''}`}
              onClick={() => {
                onSelectFunction(item.id);
                setArgError(null);
              }}
            >
              <span>{item.signature}</span>
              <small>{item.name} · {item.group}</small>
            </button>
          ))}
        </div>
      </aside>
      <div className="ax-console-main">
        <div className="ax-console-form">
          <div className="ax-console-actions">
            <span className="ax-chip">{definition.group}</span>
            <span className="ax-small-label">{matrices.length} OBJECTS</span>
          </div>
          <p className="ax-small-label" style={{ color: 'var(--ax-ink-2)', lineHeight: 1.5 }}>{definition.description}</p>
          <div className="ax-field">
            <span className="ax-field-label">ARGS / JSON</span>
            <textarea className="ax-textarea" value={args} onChange={(event) => setArgs(event.target.value)} spellCheck={false} />
          </div>
          <div className="ax-console-actions">
            <button type="button" className="ax-button primary" onClick={execute}><Icon name="play" size={11} /> RUN FUNCTION</button>
            <button type="button" className="ax-button" onClick={() => setArgs(JSON.stringify(definition.defaults, null, 2))}><Icon name="reset" size={11} /> RESET</button>
          </div>
          {argError && <div className="ax-console-error">{argError}</div>}
        </div>
        <div className="ax-console-output">
          {!result ? (
            <div className="ax-empty-inline">Run a function to inspect its raw output, trace, and storyboard.</div>
          ) : (
            <>
              {result.error && <div className="ax-console-error"><strong>ERROR</strong><br />{result.error}</div>}
              {!result.error && (
                <>
                  <div className="ax-console-actions" style={{ marginBottom: 6 }}>
                    <span className="ax-chip">{result.trace.status.toUpperCase()}</span>
                    <span className="ax-small-label">{result.trace.steps.length} TRACE STEPS · {result.trace.durationMs.toFixed(1)} MS</span>
                    {result.story && (
                      <button type="button" className="ax-button tiny" onClick={() => onOpenStory(result.story!)}>
                        <Icon name="arrow" size={10} /> OPEN REPLAY
                      </button>
                    )}
                  </div>
                  <div className="ax-console-artifacts">
                    {result.artifacts.map((artifact) => (
                      <article className="ax-console-artifact" key={artifact.id}>
                        <div className="ax-console-artifact-head">
                          <strong>{artifact.label}</strong>
                          <span>{artifact.kind}</span>
                        </div>
                        {artifact.matrix ? <MatrixReadout matrix={artifact.matrix} /> : <pre>{artifact.preview}</pre>}
                      </article>
                    ))}
                  </div>
                  <details className="ax-debug-details">
                    <summary>TRACE JSON</summary>
                    <pre>{JSON.stringify(result.trace, null, 2)}</pre>
                  </details>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
