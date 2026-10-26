import React, { useMemo } from 'react';
import { Icon } from './Icons.jsx';
import MatrixPanel from './MatrixPanel.jsx';
import { useElementSize } from '../hooks/useElementSize.js';

function formatSpeed(value) {
  return Number.isInteger(value) ? `${value.toFixed(1)}×` : `${value.toFixed(2).replace(/0$/, '')}×`;
}

function PanelFlow({ beat, viewportSize }) {
  const panels = beat.panels || [];
  const width = viewportSize.width || 760;
  const height = viewportSize.height || 360;
  const connectorCount = Math.max(0, panels.length - 1);
  const panelCount = Math.max(panels.length, 1);
  const totalCols = Math.max(1, panels.reduce((sum, p) => sum + p.matrix.cols, 0));
  const maxRows = Math.max(1, ...panels.map((p) => p.matrix.rows));
  const hasReadout = Boolean(beat.readout);
  const horizontalOverhead = 46 + panelCount * 32 + connectorCount * 42;
  const usableWidth = Math.max(96, width - horizontalOverhead);
  const usableHeight = Math.max(96, Math.min(height - (hasReadout ? 235 : 175), 360));
  const cellByWidth = usableWidth / totalCols;
  const cellByHeight = usableHeight / maxRows;
  const base = panels.length >= 3 ? 66 : panels.length === 2 ? 72 : 76;
  const cellSize = Math.max(14, Math.floor(Math.min(base, cellByWidth, cellByHeight)));
  const showConnectors = panels.length > 1;

  return (
    <div className="panel-flow" style={{ '--cell-size': `${cellSize}px` }}>
      <div className="panel-row">
        {panels.map((panel, i) => (
          <React.Fragment key={`${panel.key}-${i}`}>
            <MatrixPanel panel={panel} cellSize={cellSize} index={i} />
            {showConnectors && i < panels.length - 1 && (
              <div className="panel-connector" aria-hidden="true">
                <span>{beat.connectors?.[i] || '→'}</span>
              </div>
            )}
          </React.Fragment>
        ))}
        {!panels.length && (
          <div className="empty-panel-flow">
            <span className="empty-glyph">∅</span>
            <p>这一步没有矩阵图形，读数在下方。</p>
          </div>
        )}
      </div>
      {hasReadout && (
        <div className={`stage-readout readout-${beat.readout.tone || 'live'}`}>
          <span className="readout-eyebrow">{beat.readout.label}</span>
          <strong className={beat.readout.value.length > 18 ? 'readout-value small' : 'readout-value'}>
            {beat.readout.value}
          </strong>
          <span className="readout-note">{beat.readout.note}</span>
        </div>
      )}
      {beat.isFinale && !hasReadout && (
        <div className="finale-plaque">
          <span>FINAL EXPRESSION / 最简表达</span>
          <strong>{beat.lens?.equation}</strong>
          <em>{beat.lens?.accumulator?.value || '形状与含义一同保留'}</em>
        </div>
      )}
    </div>
  );
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
}) {
  const [viewportRef, viewportSize] = useElementSize();
  const beat = beats[beatIndex] || beats[0];
  const total = beats.length;
  const chapter = story.chapters[beat?.chapterIndex] || story.chapters[0];
  const chapterOffset = useMemo(
    () =>
      story.chapters.reduce(
        (acc, ch, index) => {
          acc[index] = acc[index - 1] != null ? acc[index - 1] + story.chapters[index - 1].beats.length : 0;
          return acc;
        },
        {},
      ),
    [story],
  );
  const chapterNumber = (beat?.chapterIndex || 0) + 1;
  const chapterBeatsBefore = chapterOffset[beat?.chapterIndex || 0] || 0;
  const beatInChapter = beatIndex - chapterBeatsBefore + 1;
  const beatDuration = (beat?.duration || 1500) / speed;
  const progress = total > 1 ? (beatIndex / (total - 1)) * 100 : 100;

  const seekChapter = (index) => {
    if (onSeek) onSeek(chapterOffset[index]);
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
        <div className="shape-contract">
          <span>SHAPE CONTRACT</span>
          <strong>{story.meta.shapeChain}</strong>
          <em>{beatInChapter} / {chapter?.beats.length} 帧 · 第 {chapterNumber} 幕</em>
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
        <div className="beat-caption">
          <span className="capture-mark">▸</span>
          <div>
            <strong>{beat?.title}</strong>
            <span>{beat?.narration}</span>
          </div>
        </div>
        <PanelFlow beat={beat} viewportSize={viewportSize} />
        <div className="beat-progress" key={beat?.id}>
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
            <span>{beat?.readout?.note || beat?.lens?.kicker || '准备就绪'}</span>
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
