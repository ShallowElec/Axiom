import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeExpression } from './core/expression.js';
import type { StoredMatrix } from './core/matrix.js';
import {
  buildBlockStory,
  buildStoryFromExpression,
  flattenBeats,
} from './presentation/stories.js';
import type { FlatBeat, Story } from './presentation/storyTypes.js';
import type { BuildStoryOptions } from './presentation/storyTypes.js';
import { libraryFrom, EXPRESSION_EXAMPLES, TEMPLATES } from './content/library.js';
import type { FormulaTemplate } from './content/library.js';
import LibraryPanel from './components/LibraryPanel';
import ExpressionBar from './components/ExpressionBar';
import Theater from './components/Theater';
import Inspector from './components/Inspector';
import MatrixEditorModal from './components/MatrixEditorModal';
import TemplateModal from './components/TemplateModal';
import BlockModal from './components/BlockModal';
import OpsModal from './components/OpsModal';
import { Modal, ModalHeader } from './components/Modal';
import { Icon } from './components/Icons';
import DebugConsole from './debug/DebugConsole.js';
import { buildStoryScene } from './scene/builders.js';
import type { MatrixDraft, BlockBuildPayload, ToastMessage, WorkspaceMatrix } from './workspace/types.js';
import {
  createProjectRecord,
  loadProjects,
  persistProjects,
  seedWorkspaceObjects,
  serializeObjects,
  withShape,
} from './workspace/project.js';
import type { ProjectRecord } from './workspace/project.js';
import ProjectModal from './components/ProjectModal.js';
import { DEBUG_FUNCTIONS } from './debug/registry.js';

const FormulaLabModal = lazy(() => import('./components/FormulaLabModal.js'));

interface BootState {
  projects: ProjectRecord[];
  activeProjectId: string;
  objects: WorkspaceMatrix[];
  expression: string;
  story: Story;
  speed: number;
}

interface RunOptions {
  autoPlay?: boolean;
  toast?: string | null;
  storyOptions?: BuildStoryOptions;
}

function createBootState(): BootState {
  const { projects, activeProjectId } = loadProjects();
  const active = projects.find((project) => project.id === activeProjectId) ?? projects[0]!;
  let objects = active.objects;
  let expression = active.expression;
  let story: Story;
  try {
    story = buildStoryFromExpression(expression, libraryFrom(objects));
  } catch {
    const fallback = objects.find((matrix) => matrix.name === 'A') ?? objects[0];
    expression = fallback?.name ?? 'A';
    try {
      story = buildStoryFromExpression(expression, libraryFrom(objects));
    } catch {
      throw new Error('无法初始化演示矩阵');
    }
  }
  return {
    projects,
    activeProjectId: active.id,
    objects,
    expression,
    story,
    speed: active.speed,
  };
}

function nextMatrixName(objects: readonly WorkspaceMatrix[]): string {
  const used = new Set(objects.map((matrix) => matrix.name));
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!used.has(letter)) return letter;
  }
  let index = 1;
  while (used.has(`M${index}`)) index += 1;
  return `M${index}`;
}

function nextBlockName(objects: readonly WorkspaceMatrix[]): string {
  const used = new Set(objects.map((matrix) => matrix.name));
  for (const base of ['K', 'P', 'Q', 'R', 'S']) {
    if (!used.has(base)) return base;
  }
  let index = 2;
  while (used.has(`K${index}`)) index += 1;
  return `K${index}`;
}

function makeId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceIdentifier(expression: string, oldName: string, newName: string): string {
  if (oldName === newName) return expression;
  const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(oldName)}(?![A-Za-z0-9_])`, 'g');
  return expression.replace(re, newName);
}

export default function App() {
  const bootRef = useRef<BootState | null>(null);
  if (!bootRef.current) bootRef.current = createBootState();
  const boot = bootRef.current;

  const [projects, setProjects] = useState<ProjectRecord[]>(boot.projects);
  const [activeProjectId, setActiveProjectId] = useState(boot.activeProjectId);
  const [objects, setObjects] = useState<WorkspaceMatrix[]>(boot.objects);
  const [expression, setExpression] = useState(boot.expression);
  const [story, setStory] = useState<Story>(boot.story);
  const [beatIndex, setBeatIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(boot.speed);
  const [editor, setEditor] = useState<{ open: boolean; matrix: StoredMatrix | null }>({
    open: false,
    matrix: null,
  });
  const [templateOpen, setTemplateOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugInitialFunctionId, setDebugInitialFunctionId] = useState<string | null>(null);
  const [templateInitialId, setTemplateInitialId] = useState<string | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [formulaLabOpen, setFormulaLabOpen] = useState(false);
  const [stageMode, setStageMode] = useState<'story' | 'layered' | 'flat'>('story');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [savedStoryId, setSavedStoryId] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const library = useMemo(() => libraryFrom(objects), [objects]);
  const analysis = useMemo(() => {
    if (!expression.trim()) {
      return { ok: false as const, error: '写一个表达式，或从矩阵库插入一个对象', input: expression };
    }
    return analyzeExpression(expression, library);
  }, [expression, library]);
  const beats = useMemo(() => flattenBeats(story), [story]);
  const suggestedName = useMemo(() => nextMatrixName(objects), [objects]);
  const blockNameSuggestion = useMemo(() => nextBlockName(objects), [objects]);
  const currentBeat: FlatBeat = beats[beatIndex] ?? beats[0]!;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const anyModalOpen =
    editor.open ||
    templateOpen ||
    blockOpen ||
    opsOpen ||
    examplesOpen ||
    debugOpen ||
    projectOpen ||
    formulaLabOpen;
  const stageScene = useMemo(
    () => buildStoryScene(story, currentBeat, stageMode === 'flat' ? 'flat' : 'layered'),
    [story, currentBeat, stageMode],
  );
  const canonical = (value: string): string =>
    String(value || '').replace(/\s+/g, '').replace(/×/g, '*').replace(/−/g, '-');
  const stale =
    Boolean(story.inputExpression) &&
    canonical(expression) !== canonical(story.inputExpression) &&
    !(story.source === 'block' && expression === story.inputExpression);

  const showToast = useCallback((message: string, type: 'info' | 'error' = 'info'): void => {
    setToast({ message, type, id: Date.now() });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    setProjects((current) => {
      const next = current.map((project) =>
        project.id === activeProjectId
          ? { ...project, objects, expression, speed, updatedAt: Date.now() }
          : project,
      );
      persistProjects(next, activeProjectId);
      return next;
    });
  }, [objects, expression, speed, activeProjectId]);

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
    (delta: number): void => {
      setPlaying(false);
      setBeatIndex((current) => Math.max(0, Math.min(beats.length - 1, current + delta)));
    },
    [beats.length],
  );

  const seekBeat = useCallback(
    (index: number): void => {
      setPlaying(false);
      setBeatIndex(Math.max(0, Math.min(beats.length - 1, Number(index) || 0)));
    },
    [beats.length],
  );

  const jumpChapter = useCallback(
    (chapterIndex: number): void => {
      setPlaying(false);
      let count = 0;
      for (let i = 0; i < chapterIndex; i++) count += story.chapters[i].beats.length;
      setBeatIndex(Math.min(count, beats.length - 1));
    },
    [story, beats.length],
  );

  const runExpression = useCallback(
    (value: string = expression, options: RunOptions = {}): boolean => {
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
        showToast(error instanceof Error ? error.message : '这个表达式还无法开演。', 'error');
        return false;
      }
    },
    [expression, library, showToast],
  );

  const handleRun = (): void => {
    if (!analysis.ok) return;
    runExpression(expression, { toast: '表达式已装入演示台' });
  };

  const insertMatrix = (name: string): void => {
    setExpression((current) => {
      const text = current.trimEnd();
      if (!text) return name;
      if (/[+\-*/^⊙⊗(]$/.test(text)) return `${text} ${name}`;
      return `${text} + ${name}`;
    });
  };

  const openNewMatrix = (): void => setEditor({ open: true, matrix: null });
  const openEditMatrix = (matrix: StoredMatrix): void => setEditor({ open: true, matrix });

  const handleSaveMatrix = (draft: MatrixDraft): void => {
    const editing = editor.matrix;
    const isEdit = Boolean(editing);
    const matrixData = {
      name: draft.name,
      rows: draft.rows,
      cols: draft.cols,
      data: draft.data,
    };
    if (isEdit) {
      if (!editing) return;
      const oldName = editing.name;
      const updated = withShape({
        ...editing,
        ...matrixData,
        name: draft.name,
        note: draft.note,
        id: editing.id || makeId(),
      });
      const nextObjects = objects.map((matrix) => (matrix.id === editing.id ? updated : matrix));
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
        showToast(error instanceof Error ? error.message : '矩阵更新失败', 'error');
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

  const handleDeleteMatrix = (matrix: StoredMatrix): void => {
    if (objects.length <= 1) {
      showToast('至少保留一个矩阵对象。', 'error');
      return;
    }
    if (!window.confirm(`删除矩阵 ${matrix.name}？引用它的表达式会失效。`)) return;
    const remaining = objects.filter((candidate) => candidate.id !== matrix.id);
    const wasUsed = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(matrix.name)}(?![A-Za-z0-9_])`).test(expression);
    let nextExpression = expression;
    if (wasUsed || !analyzeExpression(expression, libraryFrom(remaining)).ok) {
      nextExpression = remaining[0]?.name ?? nextExpression;
    }
    const nextLibrary = libraryFrom(remaining);
    let nextStory = story;
    try {
      nextStory = buildStoryFromExpression(nextExpression, nextLibrary);
    } catch {
      try {
        nextStory = buildStoryFromExpression(remaining[0].name, nextLibrary);
        nextExpression = remaining[0]?.name ?? nextExpression;
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

  const handleReset = (): void => {
    if (!window.confirm('重置矩阵库与当前表达式？本地保存的实验会被清空。')) return;
    const fresh = seedWorkspaceObjects();
    const freshStory = buildStoryFromExpression('A × B', libraryFrom(fresh));
    setObjects(fresh);
    setExpression('A × B');
    setStory(freshStory);
    setBeatIndex(0);
    setPlaying(false);
    showToast('已回到初始实验');
  };

  const snapshotProjects = useCallback(
    (records: readonly ProjectRecord[]): ProjectRecord[] =>
      records.map((project) =>
        project.id === activeProjectId
          ? { ...project, objects, expression, speed, updatedAt: Date.now() }
          : project,
      ),
    [activeProjectId, objects, expression, speed],
  );

  const applyProject = useCallback((project: ProjectRecord): void => {
    let nextExpression = project.expression;
    let nextObjects = project.objects;
    let nextStory: Story;
    try {
      nextStory = buildStoryFromExpression(nextExpression, libraryFrom(nextObjects));
    } catch {
      const fallback = nextObjects.find((matrix) => matrix.name === 'A') ?? nextObjects[0];
      nextExpression = fallback?.name ?? 'A';
      nextStory = buildStoryFromExpression(nextExpression, libraryFrom(nextObjects));
    }
    setObjects(nextObjects);
    setExpression(nextExpression);
    setStory(nextStory);
    setSpeed(project.speed);
    setBeatIndex(0);
    setPlaying(false);
    setSavedStoryId(null);
  }, []);

  const openProject = (projectId: string): void => {
    const target = projects.find((project) => project.id === projectId);
    if (!target || projectId === activeProjectId) {
      setProjectOpen(false);
      return;
    }
    const nextProjects = snapshotProjects(projects);
    setProjects(nextProjects);
    persistProjects(nextProjects, projectId);
    setActiveProjectId(projectId);
    applyProject(target);
    setProjectOpen(false);
    showToast(`已打开项目「${target.name}」`);
  };

  const createProject = (name: string): void => {
    const project = createProjectRecord(name.trim() || '新的数学现场');
    const nextProjects = [...snapshotProjects(projects), project];
    setProjects(nextProjects);
    persistProjects(nextProjects, project.id);
    setActiveProjectId(project.id);
    applyProject(project);
    setProjectOpen(false);
    showToast(`已创建项目「${project.name}」`);
  };

  const renameProjectById = (projectId: string, name: string): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextProjects = projects.map((project) =>
      project.id === projectId ? { ...project, name: trimmed, updatedAt: Date.now() } : project,
    );
    setProjects(nextProjects);
    persistProjects(nextProjects, activeProjectId);
    showToast(`项目已重命名为「${trimmed}」`);
  };

  const deleteProjectById = (projectId: string): void => {
    if (projects.length <= 1) {
      showToast('至少保留一个项目。', 'error');
      return;
    }
    const target = projects.find((project) => project.id === projectId);
    if (!target) return;
    if (!window.confirm(`删除项目「${target.name}」？其中的矩阵与表达式将一并删除。`)) return;
    const base = snapshotProjects(projects);
    const remaining = base.filter((project) => project.id !== projectId);
    const nextActive =
      projectId === activeProjectId
        ? remaining[0]!
        : base.find((project) => project.id === activeProjectId)!;
    persistProjects(remaining, nextActive.id);
    setProjects(remaining);
    setActiveProjectId(nextActive.id);
    if (projectId === activeProjectId) applyProject(nextActive);
    showToast(`已删除项目「${target.name}」`);
  };

  const handleExport = (): void => {
    const payload = {
      app: '矩阵工坊 / Matrix Atelier',
      version: 2,
      project: activeProject?.name ?? '未命名项目',
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

  const launchTemplate = (templateExpression: string, template: FormulaTemplate): void => {
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

  const launchOpsExpression = (
    value: string,
    meta: { title?: string; eyebrow?: string } = {},
  ): void => {
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

  const saveStoryResult = (): void => {
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

  const handleBlockBuild = ({ name, grid, built }: BlockBuildPayload): void => {
    const sourceNames = grid
      .flat()
      .filter((matrix): matrix is NonNullable<typeof matrix> => Boolean(matrix))
      .map((matrix) => matrix.name);
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
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      if (anyModalOpen) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setDebugOpen((open) => !open);
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (event.shiftKey) {
          const current = currentBeat.chapterIndex;
          jumpChapter(Math.max(0, current - 1));
        } else {
          stepFrame(-1);
        }
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (event.shiftKey) {
          const current = currentBeat.chapterIndex;
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
        formulas={TEMPLATES}
        algorithms={DEBUG_FUNCTIONS}
        projectName={activeProject?.name ?? '未命名项目'}
        onCreate={openNewMatrix}
        onEdit={openEditMatrix}
        onInsert={insertMatrix}
        onOpenBlock={() => setBlockOpen(true)}
        onReset={handleReset}
        onExport={handleExport}
        onOpenProjects={() => setProjectOpen(true)}
        onOpenFormula={(templateId) => {
          setTemplateInitialId(templateId);
          setTemplateOpen(true);
        }}
        onOpenAlgorithm={(functionId) => {
          setDebugInitialFunctionId(functionId);
          setDebugOpen(true);
        }}
        onOpenAllFormulas={() => {
          setTemplateInitialId(null);
          setTemplateOpen(true);
        }}
        onOpenDebug={() => {
          setDebugInitialFunctionId(null);
          setDebugOpen(true);
        }}
        onOpenFormulaLab={() => setFormulaLabOpen(true)}
      />

      <main className="workspace">
        <header className="topbar">
          <div className="workbench-path">
            <span className="path-kicker">MATRIX ATELIER</span>
            <span className="path-sep">/</span>
            <button type="button" className="project-switch" onClick={() => setProjectOpen(true)}>
              <Icon name="layers" size={13} />
              <strong>{activeProject?.name ?? '未命名项目'}</strong>
              <Icon name="chevron" size={11} />
            </button>
            <span className="path-sep">/</span>
            <strong>演算台</strong>
            <span className="session-tag">SESSION {String(story.meta.operationCount).padStart(2, '0')}</span>
          </div>
          <div className="topbar-actions">
            <span className="autosave-status"><span className="status-dot ok" /> 自动保存</span>
            <button
              type="button"
              className="topbar-button"
              onClick={() => {
                setTemplateInitialId(null);
                setTemplateOpen(true);
              }}
            >
              <Icon name="template" size={15} /> 公式仓库
            </button>
            <button type="button" className="topbar-button" onClick={() => setOpsOpen(true)}>
              <Icon name="book" size={15} /> 运算手册
            </button>
            <button
              type="button"
              className={`topbar-button ${debugOpen ? 'active' : ''}`}
              onClick={() => {
                setDebugInitialFunctionId(null);
                setDebugOpen((open) => !open);
              }}
            >
              <Icon name="function" size={15} /> 调试台
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
            viewMode={stageMode}
            onViewMode={setStageMode}
            scene={stageScene}
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
              currentBeat.isFinale
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
        initialTemplateId={templateInitialId}
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

      {formulaLabOpen && (
        <Suspense fallback={<div className="formula-lab-loading"><span>装载公式结构实验…</span></div>}>
          <FormulaLabModal
            open
            matrices={objects}
            onClose={() => setFormulaLabOpen(false)}
            onOpenInStage={(value) => {
              setFormulaLabOpen(false);
              const ok = runExpression(value, {
                toast: null,
                storyOptions: {
                  template: {
                    title: '公式结构实验 · 现场',
                    eyebrow: 'FORMULA STRUCTURE LAB',
                    description: '从 typed AST 槽位送入演算台的现场表达式。',
                  },
                },
              });
              if (ok) showToast(`结构已送入演算台：${value}`);
            }}
          />
        </Suspense>
      )}

      <ProjectModal
        open={projectOpen}
        projects={projects}
        activeProjectId={activeProjectId}
        onClose={() => setProjectOpen(false)}
        onSwitch={openProject}
        onCreate={createProject}
        onRename={renameProjectById}
        onDelete={deleteProjectById}
      />

      <DebugConsole
        open={debugOpen}
        matrices={objects}
        initialFunctionId={debugInitialFunctionId}
        onClose={() => setDebugOpen(false)}
        onOpenStory={(nextStory) => {
          setStory(nextStory);
          setExpression(nextStory.inputExpression);
          setBeatIndex(0);
          setPlaying(false);
          setDebugOpen(false);
          showToast('调试故事板已送入主舞台');
        }}
      />

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
