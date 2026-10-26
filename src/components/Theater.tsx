import { Fragment, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from './Icons';
import MatrixPanel from './MatrixPanel';
import { useElementSize } from '../hooks/useElementSize.js';
import type { ElementSize } from '../hooks/useElementSize.js';
import type { FlatBeat, Story, StoryBeat } from '../presentation/storyTypes.js';
import type { Scene } from '../scene/types.js';
import SceneRenderer from '../renderers/scene/SceneRenderer.js';

function formatSpeed(value: number): string {
  return Number.isInteger(value) ? `${value.toFixed(1)}×` : `${value.toFixed(2).replace(/0$/, '')}×`;
}

interface PanelFlowProps {
  beat: StoryBeat;
  viewportSize: ElementSize;
}

function PanelFlow({ beat, viewportSize }: PanelFlowProps) {
  const panels = beat.panels;
  const width = viewportSize.width || 760;
  const height = viewportSize.height || 360;
  const connectorCount = Math.max(0, panels.length - 1);
  const panelCount = Math.max(panels.length, 1);
  const totalCols = Math.max(1, panels.reduce((sum, p) => sum + p.matrix.cols, 0));
  const maxRows = Math.max(1, ...panels.map((p) => p.matrix.rows));
  const readout = beat.readout;
  const hasReadout = Boolean(readout);
  const horizontalOverhead = 46 + panelCount * 32 + connectorCount * 42;
  const usableWidth = Math.max(96, width - horizontalOverhead);
  const usableHeight = Math.max(96, Math.min(height - (hasReadout ? 235 : 175), 360));
  const cellByWidth = usableWidth / totalCols;
  const cellByHeight = usableHeight / maxRows;
  const base = panels.length >= 3 ? 66 : panels.length === 2 ? 72 : 76;
  const cellSize = Math.max(14, Math.floor(Math.min(base, cellByWidth, cellByHeight)));
  const showConnectors = panels.length > 1;

  return (
    <div className="panel-flow" style={{ '--cell-size': `${cellSize}px` } as CSSProperties}>
      <div className="panel-row">
        {panels.map((panel, i) => (
          <Fragment key={`${panel.key}-${i}`}>
            <MatrixPanel panel={panel} cellSize={cellSize} index={i} />
            {showConnectors && i < panels.length - 1 && (
              <div className="panel-connector" aria-hidden="true">
                <span>{beat.connectors?.[i] || '→'}</span>
              </div>
            )}
          </Fragment>
        ))}
        {!panels.length && (
          <div className="empty-panel-flow">
            <span className="empty-glyph">∅</span>
            <p>这一步没有矩阵图形，读数在下方。</p>
          </div>
        )}
      </div>
      {readout && (
        <div className={`stage-readout readout-${readout.tone || 'live'}`}>
          <span className="readout-eyebrow">{readout.label}</span>
          <strong className={readout.value.length > 18 ? 'readout-value small' : 'readout-value'}>
            {readout.value}
          </strong>
          <span className="readout-note">{readout.note}</span>
        </div>
      )}
      {beat.isFinale && !hasReadout && (
        <div className="finale-plaque">
          <span>FINAL EXPRESSION / 最简表达</span>
          <strong>{beat.lens.equation}</strong>
          <em>{beat.lens.accumulator?.value || '形状与含义一同保留'}</em>
        </div>
      )}
    </div>
  );
}

interface TheaterProps {
  story: Story;
  beats: FlatBeat[];
  beatIndex: number;
  playing: boolean;
  speed: number;
  onPlayToggle: () => void;
  onStep: (delta: number) => void;
  onSeek: (index: number) => void;
  onSpeed: (speed: number) => void;
  stale?: boolean;
  expressionValid?: boolean;
  viewMode?: 'story' | 'layered' | 'flat';
  onViewMode?: (mode: 'story' | 'layered' | 'flat') => void;
  scene?: Scene | null;
}

export default function Theater({
  story,
  beats,
  beatIndex,
  playing,
  speed,
  onPlayToggle,
  onStep,
  onSeek,
  onSpeed,
  stale = false,
  expressionValid = true,
  viewMode = 'story',
  onViewMode,
  scene = null,
}: TheaterProps) {
  const [viewportRef, viewportSize] = useElementSize();
  const beat = beats[beatIndex] ?? beats[0];
  const total = beats.length;
  const chapter = story.chapters[beat?.chapterIndex ?? 0] ?? story.chapters[0];
  const chapterOffset = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const chapterItem of story.chapters) {
      offsets.push(running);
      running += chapterItem.beats.length;
    }
    return offsets;
  }, [story]);
  const chapterNumber = (beat?.chapterIndex ?? 0) + 1;
  const chapterBeatsBefore = chapterOffset[beat?.chapterIndex ?? 0] ?? 0;
  const beatInChapter = beatIndex - chapterBeatsBefore + 1;
  const beatDuration = (beat?.duration ?? 1500) / speed;
  const progress = total > 1 ? (beatIndex / (total - 1)) * 100 : 100;

  const seekChapter = (index: number): void => {
    onSeek(chapterOffset[index] ?? 0);
  };

  return (
    <section className="theater" aria-label="矩阵动画演示台">
      <header className="stage-masthead">
        <div className="stage-title-block">
          <div className="stage-kicker">
            <span className={`live-dot ${playing ? 'playing' : ''}`} />
            <span>STAGE / {String(chapterNumber).padStart(2, '0')}</span>
            <span className="stage-kicker-rule" />
            <span>{playing ? '运行中' : '已暂停'}</span>
            {stale && (
              <span className={`stage-stale ${expressionValid ? '' : 'invalid'}`}>
                {expressionValid ? '表达式已修改 · 按「开演」重载舞台' : '表达式尚未通过检查 · 舞台保留上一场'}
              </span>
            )}
          </div>
          <h2>{chapter?.title}</h2>
          <p>{chapter?.description}</p>
        </div>
        <div className="stage-side">
          <div className="stage-view-switch" role="group" aria-label="舞台呈现方式">
            {([
              ['story', '2D'],
              ['layered', '层叠'],
              ['flat', '平铺'],
            ] as const).map(([mode, label]) => (
              <button
                type="button"
                key={mode}
                className={viewMode === mode ? 'active' : ''}
                onClick={() => onViewMode?.(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="shape-contract">
            <span>SHAPE CONTRACT</span>
            <strong>{story.meta.shapeChain}</strong>
            <em>{beatInChapter} / {chapter?.beats.length ?? 0} 帧 · 第 {chapterNumber} 幕</em>
          </div>
        </div>
      </header>

      <div className="chapter-tabs" role="tablist" aria-label="演算章节">
        {story.chapters.map((chapterItem, index) => {
          const active = index === beat?.chapterIndex;
          return (
            <button
              type="button"
              key={chapterItem.id}
              className={`chapter-tab ${active ? 'active' : ''}`}
              onClick={() => seekChapter(index)}
              role="tab"
              aria-selected={active}
            >
              <span className="chapter-num">{String(index + 1).padStart(2, '0')}</span>
              <span className="chapter-name">{chapterItem.title}</span>
              <span className="chapter-count">{chapterItem.beats.length} 步</span>
            </button>
          );
        })}
      </div>

      <div className="stage-viewport" ref={viewportRef}>
        <div className="viewport-grid" aria-hidden="true" />
        <div className="viewport-index top-left">LIVE COMPUTE / 现场演算</div>
        <div className="viewport-index top-right">EXACT RATIONAL</div>
        {viewMode === 'story' ? (
          <>
            <div className="beat-caption">
              <span className="capture-mark">▸</span>
              <div>
                <strong>{beat?.title}</strong>
                <span>{beat?.narration}</span>
              </div>
            </div>
            {beat && <PanelFlow beat={beat} viewportSize={viewportSize} />}
          </>
        ) : (
          <div className="scene-host">
            {scene ? <SceneRenderer scene={scene} /> : (
              <div className="scene-fallback">当前步骤还没有可用的场景。</div>
            )}
          </div>
        )}
        <div className="beat-progress" key={beat?.id ?? 'empty'}>
          <span
            style={{
              animationDuration: `${beatDuration}ms`,
              animationPlayState: playing ? 'running' : 'paused',
            }}
          />
        </div>
      </div>

      <footer className="transport">
        <div className="timeline-wrap">
          <div className="timeline-track">
            {story.chapters.map((c, i) => (
              <span
                key={c.id}
                className={`timeline-segment ${i === beat?.chapterIndex ? 'active' : ''} ${i < (beat?.chapterIndex || 0) ? 'past' : ''}`}
                style={{ flex: c.beats.length }}
              />
            ))}
            <span className="timeline-playhead" style={{ left: `${progress}%` }} />
          </div>
          <input
            className="timeline-range"
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            step={1}
            value={beatIndex}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="演算时间轴"
          />
        </div>

        <div className="transport-row">
          <div className="transport-buttons">
            <button type="button" className="transport-icon" onClick={() => onStep(-1)} disabled={beatIndex === 0} aria-label="上一帧">
              <Icon name="back" size={17} />
            </button>
            <button type="button" className="transport-play" onClick={onPlayToggle} aria-label={playing ? '暂停' : '播放'}>
              <Icon name={playing ? 'pause' : 'play'} size={20} />
            </button>
            <button type="button" className="transport-icon" onClick={() => onStep(1)} disabled={beatIndex === total - 1} aria-label="下一帧">
              <Icon name="forward" size={17} />
            </button>
            <span className="frame-counter">
              <strong>{String(beatIndex + 1).padStart(2, '0')}</strong>
              <span>/ {String(total).padStart(2, '0')}</span>
            </span>
          </div>

          <div className="transport-now">
            <span className="transport-pulse" />
            <span>{beat?.readout?.note || beat?.lens.kicker || '准备就绪'}</span>
          </div>

          <label className="speed-control">
            <span>速度</span>
            <input
              type="range"
              min="0.25"
              max="3"
              step="0.25"
              value={speed}
              onChange={(e) => onSpeed(Number(e.target.value))}
              aria-label="动画速度"
            />
            <strong>{formatSpeed(speed)}</strong>
          </label>
        </div>
      </footer>
    </section>
  );
}
