import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JsonValue } from '../core/protocol.js';
import type { Matrix } from '../core/matrix.js';
import { libraryFrom } from '../content/library.js';
import { DEBUG_FUNCTIONS, DEBUG_GROUPS, debugFunctionById, runDebugFunction } from './registry.js';
import type { DebugFunctionDefinition, DebugRunResult } from './types.js';
import type { Story } from '../presentation/storyTypes.js';
import SceneRenderer from '../renderers/scene/SceneRenderer.js';
import { MatrixMini } from '../components/MatrixPanel.js';
import { Icon } from '../components/Icons.js';

type DebugTab = 'output' | 'trace' | 'story' | 'scene';

interface DebugConsoleProps {
  open: boolean;
  matrices: readonly Matrix[];
  initialFunctionId?: string | null;
  onClose: () => void;
  onOpenStory: (story: Story) => void;
}

const TABS: Array<{ id: DebugTab; label: string }> = [
  { id: 'output', label: '输出' },
  { id: 'trace', label: '轨迹' },
  { id: 'story', label: '故事板' },
  { id: 'scene', label: '场景' },
];

export default function DebugConsole({
  open,
  matrices,
  initialFunctionId = null,
  onClose,
  onOpenStory,
}: DebugConsoleProps) {
  const [selectedId, setSelectedId] = useState(DEBUG_FUNCTIONS[0]?.id ?? 'matmul');
  const [argsText, setArgsText] = useState('{}');
  const [result, setResult] = useState<DebugRunResult | null>(null);
  const [argError, setArgError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DebugTab>('output');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [showRawScene, setShowRawScene] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(
    () => debugFunctionById(selectedId) ?? DEBUG_FUNCTIONS[0]!,
    [selectedId],
  );
  const library = useMemo(() => libraryFrom(matrices), [matrices]);
  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return DEBUG_GROUPS.map((group) => ({
      group,
      items: DEBUG_FUNCTIONS.filter((item) => item.group === group),
    }));
    return DEBUG_GROUPS.map((group) => ({
      group,
      items: DEBUG_FUNCTIONS.filter(
        (item) =>
          item.group === group &&
          `${item.name} ${item.signature} ${item.description}`.toLowerCase().includes(query),
      ),
    })).filter((group) => group.items.length);
  }, [search]);

  const execute = useCallback(
    (definition: DebugFunctionDefinition, args: Record<string, JsonValue>): void => {
      setArgError(null);
      const next = runDebugFunction(definition, args, { matrices, library: libraryFrom(matrices) });
      setResult(next);
      setSceneIndex(0);
      setActiveTab('output');
    },
    [matrices],
  );

  useEffect(() => {
    if (!open || !initialFunctionId) return;
    if (debugFunctionById(initialFunctionId)) setSelectedId(initialFunctionId);
  }, [open, initialFunctionId]);

  useEffect(() => {
    if (!open) return;
    const definition = debugFunctionById(selectedId) ?? DEBUG_FUNCTIONS[0]!;
    const defaultsText = JSON.stringify(definition.defaults, null, 2);
    setArgsText(defaultsText);
    execute(definition, definition.defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const chooseFunction = (definition: DebugFunctionDefinition): void => {
    setSelectedId(definition.id);
  };

  const runFromEditor = (): void => {
    try {
      const parsed = JSON.parse(argsText) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('参数必须是一个 JSON 对象，例如 {"A":"A","B":"B"}');
      }
      setArgError(null);
      execute(selected, parsed as Record<string, JsonValue>);
    } catch (error) {
      setArgError(error instanceof Error ? error.message : '参数 JSON 无法解析');
    }
  };

  const activeScene = result?.scenes[sceneIndex];
  const sceneJson = activeScene ? JSON.stringify(activeScene, null, 2) : '';
  const story = result?.story;

  return (
    <section className="debug-console" aria-label="函数调试控制台">
      <header className="debug-head">
        <div className="debug-title">
          <span className="micro-label"><span className="live-dot small" /> DEBUG CONSOLE / 函数调试台</span>
          <h3>{selected.name} <span>{selected.signature}</span></h3>
        </div>
        <div className="debug-head-meta">
          <span>纯函数</span>
          <span>无 DOM</span>
          <span>可序列化</span>
          <button type="button" className="debug-close" onClick={onClose} aria-label="关闭调试控制台">
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>

      <div className="debug-body">
        <aside className="debug-functions">
          <label className="debug-search">
            <Icon name="function" size={13} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索函数 / 签名"
              spellCheck="false"
            />
          </label>
          <div className="debug-function-list">
            {filteredGroups.map((group) => (
              <div key={group.group} className="debug-function-group">
                <span className="debug-group-label">{group.group}</span>
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`debug-fn ${item.id === selectedId ? 'active' : ''}`}
                    onClick={() => chooseFunction(item)}
                  >
                    <span>{item.signature}</span>
                    <em>{item.name}</em>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="debug-library">
            <span className="debug-group-label">可用对象</span>
            <div>
              {matrices.map((matrix) => (
                <span key={matrix.name} className="debug-matrix-chip" title={`${matrix.name} · ${matrix.rows}×${matrix.cols}`}>
                  {matrix.name}<em>{matrix.rows}×{matrix.cols}</em>
                </span>
              ))}
            </div>
          </div>
        </aside>

        <div className="debug-main">
          <div className="debug-doc">
            <p>{selected.description}</p>
            <div className="debug-params">
              {selected.params.map((param) => (
                <span key={param.key}><b>{param.key}</b><em>{param.kind}</em>{param.description}</span>
              ))}
            </div>
          </div>

          <div className="debug-args-row">
            <label className="debug-args">
              <span>ARGS / JSON 参数</span>
              <textarea
                value={argsText}
                onChange={(event) => {
                  setArgsText(event.target.value);
                  setArgError(null);
                }}
                spellCheck="false"
                rows={5}
              />
            </label>
            <div className="debug-run-col">
              <button type="button" className="debug-run" onClick={runFromEditor}>
                <Icon name="play" size={14} /> 运行函数
              </button>
              <button
                type="button"
                className="debug-ghost"
                onClick={() => {
                  setArgsText(JSON.stringify(selected.defaults, null, 2));
                  setArgError(null);
                }}
              >
                <Icon name="reset" size={12} /> 恢复默认
              </button>
              <span className="debug-run-state">
                {argError ? <em className="error">{argError}</em> : result ? `${result.trace.durationMs.toFixed(1)} ms` : '等待运行'}
              </span>
            </div>
          </div>

          <div className="debug-tabs">
            {TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                className={activeTab === tab.id ? 'active' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
            <span className="debug-trace-ref">traceRef · {result?.trace.runId ?? '—'}</span>
          </div>

          <div className="debug-panel">
            {activeTab === 'output' && (
              <div className="debug-output">
                {result?.error && (
                  <div className="debug-error"><b>运行失败</b><span>{result.error}</span></div>
                )}
                {!result && !argError && <p className="debug-placeholder">选择函数并运行。</p>}
                {result && !result.error && result.artifacts.length === 0 && (
                  <p className="debug-placeholder">函数没有返回可展示的值。</p>
                )}
                {result?.artifacts.map((artifact) => (
                  <article key={artifact.id} className={`debug-artifact kind-${artifact.kind}`}>
                    <div className="debug-artifact-head">
                      <strong>{artifact.label}</strong>
                      <span>{artifact.kind}</span>
                    </div>
                    {artifact.matrix ? (
                      <>
                        <MatrixMini matrix={artifact.matrix} max={5} variant="light" />
                        <details className="debug-artifact-values">
                          <summary>文本值</summary>
                          <pre>{artifact.preview}</pre>
                        </details>
                      </>
                    ) : (
                      <strong className="debug-scalar-value">{artifact.preview}</strong>
                    )}
                  </article>
                ))}
              </div>
            )}

            {activeTab === 'trace' && (
              <div className="debug-trace">
                {!result ? (
                  <p className="debug-placeholder">运行一次函数后，这里会出现可序列化的计算轨迹。</p>
                ) : (
                  <>
                    <div className="debug-trace-meta">
                      <span>status <b>{result.trace.status}</b></span>
                      <span>steps <b>{result.trace.steps.length}</b></span>
                      <span>inputs <b>{result.trace.inputs.length}</b></span>
                      <span>outputs <b>{result.trace.outputs.length}</b></span>
                    </div>
                    <ol className="debug-timeline">
                      {result.trace.steps.map((step) => (
                        <li key={step.id} className={`trace-step kind-${step.kind}`}>
                          <span className="trace-index">{String(step.index + 1).padStart(2, '0')}</span>
                          <div>
                            <strong>{step.title}</strong>
                            {step.detail && <p>{step.detail}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                    <details className="debug-raw">
                      <summary>查看原始 Trace JSON</summary>
                      <pre>{JSON.stringify(result.trace, null, 2)}</pre>
                    </details>
                  </>
                )}
              </div>
            )}

            {activeTab === 'story' && (
              <div className="debug-story">
                {!story ? (
                  <p className="debug-placeholder">这个函数返回原始读数，没有故事板。可在场景页查看抽象流水线。</p>
                ) : (
                  <>
                    <div className="debug-story-head">
                      <div>
                        <span className="micro-label">STORYBOARD / 动画抽象</span>
                        <h4>{story.title}</h4>
                        <p>{story.expression} · {story.meta.shapeChain}</p>
                      </div>
                      <button type="button" className="debug-open-story" onClick={() => onOpenStory(story)}>
                        <Icon name="arrow" size={13} /> 送入主舞台
                      </button>
                    </div>
                    <div className="debug-chapters">
                      {story.chapters.map((chapter, index) => (
                        <div key={chapter.id} className="debug-chapter">
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <div><strong>{chapter.title}</strong><em>{chapter.beats.length} 步</em></div>
                        </div>
                      ))}
                    </div>
                    <details className="debug-raw">
                      <summary>查看故事板结构 JSON</summary>
                      <pre>{JSON.stringify(story, null, 2)}</pre>
                    </details>
                  </>
                )}
              </div>
            )}

            {activeTab === 'scene' && (
              <div className="debug-scene">
                {!activeScene ? (
                  <p className="debug-placeholder">这个运行没有生成场景。</p>
                ) : (
                  <>
                    <div className="debug-scene-bar">
                      <div className="debug-scene-switch">
                        {result?.scenes.map((scene, index) => (
                          <button
                            type="button"
                            key={scene.id}
                            className={sceneIndex === index ? 'active' : ''}
                            onClick={() => setSceneIndex(index)}
                          >
                            {scene.space === 'layered' ? '层叠' : '平铺'} · {scene.title.slice(0, 16)}
                          </button>
                        ))}
                      </div>
                      <button type="button" className="debug-ghost" onClick={() => setShowRawScene((value) => !value)}>
                        {showRawScene ? '渲染视图' : 'Scene JSON'}
                      </button>
                    </div>
                    {showRawScene ? (
                      <pre className="debug-scene-json">{sceneJson}</pre>
                    ) : (
                      <div className="debug-scene-stage">
                        <SceneRenderer scene={activeScene} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
