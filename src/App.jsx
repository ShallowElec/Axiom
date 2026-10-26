import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeExpression } from './engine/expression.js';
import { matrixFromRows } from './engine/matrix.js';
import {
  buildBlockStory,
  buildStoryFromExpression,
  flattenBeats,
} from './engine/stories.js';
import { seedObjects, libraryFrom, EXPRESSION_EXAMPLES } from './data/seed.js';
import LibraryPanel from './components/LibraryPanel.jsx';
import ExpressionBar from './components/ExpressionBar.jsx';
import Theater from './components/Theater.jsx';
import Inspector from './components/Inspector.jsx';
import MatrixEditorModal from './components/MatrixEditorModal.jsx';
import TemplateModal from './components/TemplateModal.jsx';
import BlockModal from './components/BlockModal.jsx';
import OpsModal from './components/OpsModal.jsx';
import { Modal, ModalHeader } from './components/Modal.jsx';
import { Icon } from './components/Icons.jsx';

const STORAGE_KEY = 'matrix-atelier.workspace.v1';

function withShape(matrix) {
  return { ...matrix, shape: `${matrix.rows}×${matrix.cols}` };
}

function serializeObjects(objects) {
  return objects.map((matrix) => ({
    id: matrix.id,
    name: matrix.name,
    note: matrix.note,
    rows: matrix.rows,
    cols: matrix.cols,
    data: matrix.data.map((row) => row.map((value) => value.toString())),
  }));
}

function hydrateObjects(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new Error('没有可用的矩阵');
  const seen = new Set();
  return raw.map((entry) => {
    if (!entry || !entry.name || !Array.isArray(entry.data)) throw new Error('矩阵数据损坏');
    if (seen.has(entry.name)) throw new Error(`矩阵名字重复：${entry.name}`);
    seen.add(entry.name);
    const matrix = matrixFromRows(entry.data, entry.name);
    return withShape({
      ...matrix,
      id: entry.id || `restored-${entry.name}-${Math.random().toString(36).slice(2, 7)}`,
      note: entry.note || '恢复的矩阵对象',
    });
  });
}

function createBootState() {
  let objects = seedObjects().map(withShape);
  let expression = 'A × B';
  let speed = 1;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw?.matrices?.length) {
      try {
        objects = hydrateObjects(raw.matrices);
        expression = raw.expression || 'A × B';
        speed = Number(raw.speed) || 1;
      } catch {
        objects = seedObjects().map(withShape);
        expression = 'A × B';
      }
    }
  } catch {
    // A broken local snapshot should never block the atelier from opening.
  }
  let story;
  try {
    story = buildStoryFromExpression(expression, libraryFrom(objects));
  } catch {
    const fallback = objects.find((m) => m.name === 'A') || objects[0];
    expression = fallback?.name || 'A';
    try {
      story = buildStoryFromExpression(expression, libraryFrom(objects));
    } catch {
      throw new Error('无法初始化演示矩阵');
    }
  }
  return { objects, expression, story, speed };
}

function nextMatrixName(objects) {
  const used = new Set(objects.map((m) => m.name));
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!used.has(letter)) return letter;
  }
  let index = 1;
  while (used.has(`M${index}`)) index += 1;
  return `M${index}`;
}

function nextBlockName(objects) {
  const used = new Set(objects.map((m) => m.name));
  for (const base of ['K', 'P', 'Q', 'R', 'S']) {
    if (!used.has(base)) return base;
  }
  let index = 2;
  while (used.has(`K${index}`)) index += 1;
  return `K${index}`;
}

function makeId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceIdentifier(expression, oldName, newName) {
  if (oldName === newName) return expression;
  const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(oldName)}(?![A-Za-z0-9_])`, 'g');
  return expression.replace(re, newName);
}

export default function App() {
  const bootRef = useRef(null);
  if (!bootRef.current) bootRef.current = createBootState();
  const boot = bootRef.current;

  const [objects, setObjects] = useState(boot.objects);
  const [expression, setExpression] = useState(boot.expression);
  const [story, setStory] = useState(boot.story);
  const [beatIndex, setBeatIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(boot.speed);
  const [editor, setEditor] = useState({ open: false, matrix: null });
  const [templateOpen, setTemplateOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [savedStoryId, setSavedStoryId] = useState(null);
  const toastTimer = useRef(null);

  const library = useMemo(() => libraryFrom(objects), [objects]);
  const analysis = useMemo(() => {
    if (!expression.trim()) return { ok: false, error: '写一个表达式，或从矩阵库插入一个对象' };
    return analyzeExpression(expression, library);
  }, [expression, library]);
  const beats = useMemo(() => flattenBeats(story), [story]);
  const suggestedName = useMemo(() => nextMatrixName(objects), [objects]);
  const blockNameSuggestion = useMemo(() => nextBlockName(objects), [objects]);
  const currentBeat = beats[beatIndex] || beats[0];
  const anyModalOpen = editor.open || templateOpen || blockOpen || opsOpen || examplesOpen;
  const canonical = (value) => String(value || '').replace(/\s+/g, '').replace(/×/g, '*').replace(/−/g, '-');
  const stale =
    Boolean(story.inputExpression) &&
    canonical(expression) !== canonical(story.inputExpression) &&
    !(story.source === 'block' && expression === story.inputExpression);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, matrices: serializeObjects(objects), expression, speed }),
      );
    } catch {
      // Storage can be unavailable; the app still runs in memory.
    }
  }, [objects, expression, speed]);

  useEffect(() => {
    if (anyModalOpen) setToast(null);
  }, [anyModalOpen]);

  useEffect(() => {
    if (!playing) return undefined;
    if (beatIndex >= beats.length - 1) {
      setPlaying(false);
      return undefined;
    }
    const duration = (beats[beatIndex]?.duration || 1500) / speed;
    const timer = window.setTimeout(() => {
      setBeatIndex((current) => Math.min(current + 1, beats.length - 1));
    }, duration);
    return () => window.clearTimeout(timer);
  }, [playing, beatIndex, beats, speed]);

  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (beatIndex >= beats.length - 1) setBeatIndex(0);
    setPlaying(true);
  }, [playing, beatIndex, beats.length]);

  const stepFrame = useCallback(
    (delta) => {
      setPlaying(false);
      setBeatIndex((current) => Math.max(0, Math.min(beats.length - 1, current + delta)));
    },
    [beats.length],
  );

  const seekBeat = useCallback(
    (index) => {
      setPlaying(false);
      setBeatIndex(Math.max(0, Math.min(beats.length - 1, Number(index) || 0)));
    },
    [beats.length],
  );

  const jumpChapter = useCallback(
    (chapterIndex) => {
      setPlaying(false);
      let count = 0;
      for (let i = 0; i < chapterIndex; i++) count += story.chapters[i].beats.length;
      setBeatIndex(Math.min(count, beats.length - 1));
    },
    [story, beats.length],
  );

  const runExpression = useCallback(
    (value = expression, options = {}) => {
      const trimmed = String(value).trim();
      if (!trimmed) {
        showToast('先写一个矩阵表达式。', 'error');
        return false;
      }
      try {
        const nextStory = buildStoryFromExpression(trimmed, library, options.storyOptions || {});
        setExpression(trimmed);
        setStory(nextStory);
        setBeatIndex(0);
        setPlaying(options.autoPlay !== false);
        if (options.toast) showToast(options.toast);
        return true;
      } catch (error) {
        showToast(error.message || '这个表达式还无法开演。', 'error');
        return false;
      }
    },
    [expression, library, showToast],
  );

  const handleRun = () => {
    if (!analysis.ok) return;
    runExpression(expression, { toast: '表达式已装入演示台' });
  };

  const insertMatrix = (name) => {
    setExpression((current) => {
      const text = current.trimEnd();
      if (!text) return name;
      if (/[+\-*/^⊙⊗(]$/.test(text)) return `${text} ${name}`;
      return `${text} + ${name}`;
    });
  };

  const openNewMatrix = () => setEditor({ open: true, matrix: null });
  const openEditMatrix = (matrix) => setEditor({ open: true, matrix });

  const handleSaveMatrix = (draft) => {
    const isEdit = Boolean(editor.matrix);
    const matrixData = {
      name: draft.name,
      rows: draft.rows,
      cols: draft.cols,
      data: draft.data,
    };
    if (isEdit) {
      const oldName = editor.matrix.name;
      const updated = withShape({
        ...editor.matrix,
        ...matrixData,
        name: draft.name,
        note: draft.note,
        id: editor.matrix.id || makeId(),
      });
      const nextObjects = objects.map((m) => (m.id === editor.matrix.id ? updated : m));
      let nextExpression = expression;
      try {
        if (oldName !== draft.name) nextExpression = replaceIdentifier(expression, oldName, draft.name);
        setObjects(nextObjects);
        setExpression(nextExpression);
        if (story.source === 'expression') {
          try {
            const nextStory = buildStoryFromExpression(nextExpression, libraryFrom(nextObjects));
            setStory(nextStory);
            setBeatIndex(0);
            setPlaying(false);
          } catch {
            // Keep the old story; the expression bar will show the new validation error.
          }
        }
        showToast(`矩阵 ${updated.name} 已更新`);
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        setEditor({ open: false, matrix: null });
      }
      return;
    }

    const created = withShape({
      ...matrixData,
      id: makeId(),
      note: draft.note || '自定义矩阵对象',
    });
    setObjects((current) => [...current, created]);
    setEditor({ open: false, matrix: null });
    showToast(`矩阵 ${created.name} 已放入矩阵库`);
  };

  const handleDeleteMatrix = (matrix) => {
    if (objects.length <= 1) {
      showToast('至少保留一个矩阵对象。', 'error');
      return;
    }
    if (!window.confirm(`删除矩阵 ${matrix.name}？引用它的表达式会失效。`)) return;
    const remaining = objects.filter((m) => m.id !== matrix.id);
    const wasUsed = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(matrix.name)}(?![A-Za-z0-9_])`).test(expression);
    let nextExpression = expression;
    if (wasUsed || !analyzeExpression(expression, libraryFrom(remaining)).ok) {
      nextExpression = remaining[0].name;
    }
    const nextLibrary = libraryFrom(remaining);
    let nextStory = story;
    try {
      nextStory = buildStoryFromExpression(nextExpression, nextLibrary);
    } catch {
      try {
        nextStory = buildStoryFromExpression(remaining[0].name, nextLibrary);
        nextExpression = remaining[0].name;
      } catch {
        // Ignore; the remaining library still has at least one valid object.
      }
    }
    setObjects(remaining);
    setExpression(nextExpression);
    setStory(nextStory);
    setBeatIndex(0);
    setPlaying(false);
    setEditor({ open: false, matrix: null });
    showToast(`已删除矩阵 ${matrix.name}`);
  };

  const handleReset = () => {
    if (!window.confirm('重置矩阵库与当前表达式？本地保存的实验会被清空。')) return;
    const fresh = seedObjects().map(withShape);
    const freshStory = buildStoryFromExpression('A × B', libraryFrom(fresh));
    setObjects(fresh);
    setExpression('A × B');
    setStory(freshStory);
    setBeatIndex(0);
    setPlaying(false);
    showToast('已回到初始实验');
  };

  const handleExport = () => {
    const payload = {
      app: '矩阵工坊 / Matrix Atelier',
      version: 1,
      exportedAt: new Date().toISOString(),
      expression: story.meta.expression,
      rule: story.meta.rule,
      shapeChain: story.meta.shapeChain,
      result: story.meta.result,
      matrices: serializeObjects(objects),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `matrix-atelier-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('实验快照已导出');
  };

  const launchTemplate = (templateExpression, template) => {
    setTemplateOpen(false);
    const ok = runExpression(templateExpression, {
      toast: null,
      storyOptions: {
        template: {
          title: template.title,
          eyebrow: template.eyebrow || 'FORMULA GALLERY',
          description: template.subtitle,
        },
      },
    });
    if (ok) showToast(`已装填「${template.title}」并开始演示`);
  };

  const launchOpsExpression = (value, meta = {}) => {
    setOpsOpen(false);
    const ok = runExpression(value, {
      toast: null,
      storyOptions: {
        template: {
          title: meta.title ? `${meta.title} · 现场演算` : undefined,
          eyebrow: meta.eyebrow || 'OPERATION LIBRARY',
        },
      },
    });
    if (ok) showToast(`已装填 ${value}`);
  };

  const saveStoryResult = () => {
    const result = story.resultValue;
    if (!result || result.kind !== 'matrix') {
      showToast('这次结果是一个标量，没有可入库的行列对象。', 'error');
      return;
    }
    const name = nextMatrixName(objects);
    if (objects.some((m) => m.name === name)) {
      showToast('矩阵库里已经有同名对象。', 'error');
      return;
    }
    const saved = withShape({
      name,
      rows: result.matrix.rows,
      cols: result.matrix.cols,
      data: result.matrix.data.map((row) => row.map((value) => value.clone())),
      id: makeId(),
      note: `由 ${story.meta.expression} 的结果生成`,
    });
    setObjects((current) => [...current, saved]);
    setSavedStoryId(story.id);
    showToast(`结果已存为矩阵 ${name}，可继续插入表达式或参与分块。`);
  };

  const handleBlockBuild = ({ name, grid, built, rows, cols }) => {
    const sourceNames = grid.flat().filter(Boolean).map((m) => m.name);
    const newMatrix = withShape({
      ...built.matrix,
      name,
      id: makeId(),
      note: `由 ${[...new Set(sourceNames)].join('、')} 分块拼合`,
    });
    const nextObjects = [...objects, newMatrix];
    const decoratedBuilt = { ...built, matrix: newMatrix };
    const nextStory = buildBlockStory({
      grid,
      built: decoratedBuilt,
      resultName: name,
      expression: `${name} = block(${sourceNames.join(', ')})`,
    });
    setObjects(nextObjects);
    setExpression(name);
    setStory(nextStory);
    setBeatIndex(0);
    setPlaying(true);
    setBlockOpen(false);
    showToast(`组合矩阵 ${name} 已入库，开始逐格铺设`);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (target?.closest?.('input, textarea, select, button, [contenteditable="true"]')) return;
      if (anyModalOpen) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (event.shiftKey) {
          const current = currentBeat?.chapterIndex || 0;
          jumpChapter(Math.max(0, current - 1));
        } else {
          stepFrame(-1);
        }
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (event.shiftKey) {
          const current = currentBeat?.chapterIndex || 0;
          jumpChapter(Math.min(story.chapters.length - 1, current + 1));
        } else {
          stepFrame(1);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [anyModalOpen, togglePlay, stepFrame, jumpChapter, currentBeat, story.chapters.length]);

  return (
    <div className={`app-shell platform-${window.desktop?.platform || 'web'}`}>
      <LibraryPanel
        matrices={objects}
        stories={[]}
        onCreate={openNewMatrix}
        onEdit={openEditMatrix}
        onInsert={insertMatrix}
        onOpenBlock={() => setBlockOpen(true)}
        onReset={handleReset}
        onExport={handleExport}
        activeExpression={expression}
      />

      <main className="workspace">
        <header className="topbar">
          <div className="workbench-path">
            <span className="path-kicker">MATRIX ATELIER</span>
            <span className="path-sep">/</span>
            <strong>演示现场</strong>
            <span className="session-tag">SESSION {String(story.meta.operationCount).padStart(2, '0')}</span>
          </div>
          <div className="topbar-actions">
            <span className="autosave-status"><span className="status-dot ok" /> 自动保存</span>
            <button type="button" className="topbar-button" onClick={() => setTemplateOpen(true)}>
              <Icon name="template" size={15} /> 公式模板
            </button>
            <button type="button" className="topbar-button" onClick={() => setOpsOpen(true)}>
              <Icon name="book" size={15} /> 运算手册
            </button>
            <button type="button" className="topbar-icon" onClick={handleExport} title="导出实验快照" aria-label="导出实验快照">
              <Icon name="download" size={16} />
            </button>
          </div>
        </header>

        <ExpressionBar
          expression={expression}
          setExpression={setExpression}
          matrices={objects}
          analysis={analysis}
          onRun={handleRun}
          onOpenExamples={() => setExamplesOpen(true)}
          onOpenTemplates={() => setTemplateOpen(true)}
          onOpenOps={() => setOpsOpen(true)}
        />

        <div className="workbench">
          <Theater
            story={story}
            beats={beats}
            beatIndex={beatIndex}
            playing={playing}
            speed={speed}
            onPlayToggle={togglePlay}
            onStep={stepFrame}
            onSeek={seekBeat}
            onSpeed={setSpeed}
            stale={stale}
            expressionValid={analysis.ok}
          />
          <Inspector
            story={story}
            beat={currentBeat}
            beats={beats}
            beatIndex={beatIndex}
            onJumpChapter={jumpChapter}
            onSaveResult={saveStoryResult}
            canSaveResult={
              story.resultValue?.kind === 'matrix' &&
              Boolean(story.resultValue.matrix) &&
              story.source !== 'block' &&
              savedStoryId !== story.id &&
              Boolean(currentBeat?.isFinale)
            }
          />
        </div>
      </main>

      <MatrixEditorModal
        open={editor.open}
        initial={editor.matrix}
        suggestedName={suggestedName}
        existingNames={objects.map((m) => m.name)}
        onClose={() => setEditor({ open: false, matrix: null })}
        onSave={handleSaveMatrix}
        onDelete={handleDeleteMatrix}
      />

      <TemplateModal
        open={templateOpen}
        matrices={objects}
        onClose={() => setTemplateOpen(false)}
        onLaunch={launchTemplate}
        onOpenBlock={() => {
          setTemplateOpen(false);
          setBlockOpen(true);
        }}
      />

      <BlockModal
        open={blockOpen}
        matrices={objects}
        nameSuggestion={blockNameSuggestion}
        onClose={() => setBlockOpen(false)}
        onBuild={handleBlockBuild}
      />

      <OpsModal
        open={opsOpen}
        matrices={objects}
        onClose={() => setOpsOpen(false)}
        onLaunchExpression={launchOpsExpression}
        onOpenBlock={() => {
          setOpsOpen(false);
          setBlockOpen(true);
        }}
      />

      {examplesOpen && (
        <Modal open={examplesOpen} onClose={() => setExamplesOpen(false)} className="examples-modal" labelledBy="examples-title">
          <ModalHeader
            id="examples-title"
            eyebrow="STARTING POINTS / 现场示例"
            title="先看一次计算，再自己写一条"
            description="每一个例子都会直接装入当前矩阵库里的具体数字。"
            onClose={() => setExamplesOpen(false)}
          />
          <div className="examples-grid">
            {EXPRESSION_EXAMPLES.map((example) => {
              const preview = analyzeExpression(example.expression, library);
              return (
                <button
                  type="button"
                  key={example.expression}
                  className="example-card"
                  disabled={!preview.ok}
                  onClick={() => {
                    setExamplesOpen(false);
                    runExpression(example.expression, { toast: `已载入示例 ${example.expression}` });
                  }}
                >
                  <span className="example-formula">{example.expression}</span>
                  <span className="example-label">{example.label}</span>
                  <span className="example-shape">
                    {preview.ok ? (preview.kind === 'matrix' ? `${preview.shape.rows}×${preview.shape.cols}` : '标量') : '当前矩阵不满足'}
                  </span>
                  <Icon name="arrow" size={14} />
                </button>
              );
            })}
          </div>
          <div className="examples-footnote">
            提示：在表达式里输入 <code>2 × A</code> 可尝试数乘；<code>solve(M, b)</code> 会进入增广消元。
          </div>
        </Modal>
      )}

      {toast && (
        <div className={`toast ${toast.type}`} key={toast.id}>
          <span className="toast-mark">{toast.type === 'error' ? '!' : '✓'}</span>
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="关闭提示">
            <Icon name="close" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
