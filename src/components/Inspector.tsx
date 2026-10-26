import { Icon } from './Icons';
import type { FlatBeat, LensTerm, Story } from '../presentation/storyTypes.js';

function TermList({ terms = [] }: { terms?: LensTerm[] }) {
  if (!terms.length) return null;
  return (
    <div className="lens-terms">
      {terms.map((term, index) => (
        <div key={`${term.label}-${index}`} className={`lens-term state-${term.state || 'future'}`}>
          <span className="term-state-dot" />
          <span className="term-label">{term.label}</span>
          <span className="term-expr">{term.expr}</span>
          {term.value !== '' && term.value != null && <span className="term-value">{term.value}</span>}
        </div>
      ))}
    </div>
  );
}

interface InspectorProps {
  story: Story;
  beat: FlatBeat;
  beatIndex: number;
  beats: readonly FlatBeat[];
  onJumpChapter: (index: number) => void;
  onSaveResult: () => void;
  canSaveResult?: boolean;
}

export default function Inspector({
  story,
  beat,
  beatIndex,
  beats,
  onJumpChapter,
  onSaveResult,
  canSaveResult = false,
}: InspectorProps) {
  if (!beat) return null;
  const lens = beat.lens;
  const chapter = story.chapters[beat.chapterIndex];
  if (!chapter) return null;
  const chapterStart = beats.findIndex((b) => b.chapterIndex === beat.chapterIndex);
  const chapterBeats = beats.filter((b) => b.chapterIndex === beat.chapterIndex);
  const isFinale = beat.isFinale;

  return (
    <aside className="inspector" aria-label="此刻发生的计算">
      <div className="inspector-scroll">
        <div className="inspector-head">
          <div>
            <span className="micro-label">
              <span className={`live-dot small ${isFinale ? 'finale' : ''}`} />
              {isFinale ? 'FINAL FORM' : 'LIVE TRACE'}
            </span>
            <h3>{isFinale ? '最简表达' : '此刻发生什么'}</h3>
          </div>
          <span className="step-stamp">
            {String(beatIndex + 1).padStart(2, '0')} / {String(beats.length).padStart(2, '0')}
          </span>
        </div>

        <div className={`focus-card ${isFinale ? 'is-finale' : ''}`}>
          <div className="focus-kicker">
            <span>{lens.kicker || chapter.tag}</span>
            <span>{chapter.tag}</span>
          </div>
          <h4>{lens.heading || beat.title}</h4>
          {lens.equation && <div className="equation-display">{lens.equation}</div>}
          <TermList terms={lens.terms} />
          {lens.accumulator && (
            <div className="accumulator">
              <span>{lens.accumulator.label}</span>
              <strong>{lens.accumulator.value}</strong>
            </div>
          )}
          {lens.note && <p className="lens-note">{lens.note}</p>}
        </div>

        {lens.rule && (
          <div className="rule-card">
            <span className="rule-icon">∴</span>
            <div>
              <span className="micro-label">RULE / 这一条规则</span>
              <p>{lens.rule}</p>
            </div>
          </div>
        )}

        <div className="chapter-outline">
          <div className="outline-head">
            <span className="micro-label">CHAPTERS / 逐层展开</span>
            <span>{story.chapters.length} 幕</span>
          </div>
          {story.chapters.map((ch, index) => {
            const active = index === beat.chapterIndex;
            const completed = index < beat.chapterIndex || (active && beatIndex === chapterBeats[chapterBeats.length - 1]?.index);
            return (
              <button
                type="button"
                key={ch.id}
                className={`outline-row ${active ? 'active' : ''} ${completed ? 'completed' : ''}`}
                onClick={() => onJumpChapter(index)}
              >
                <span className="outline-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="outline-copy">
                  <strong>{ch.title}</strong>
                  <span>{ch.tag} · {ch.beats.length} 步</span>
                </span>
                <span className="outline-mark">
                  {completed ? <Icon name="check" size={13} /> : active ? <span className="outline-current" /> : <span className="outline-future" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="inspector-hint">
          <Icon name="keyboard" size={14} />
          <span>空格播放 / 暂停 · ← → 逐帧 · Shift ← → 跨幕</span>
        </div>
      </div>

      <div className="inspector-foot">
        <div className="shape-row">
          <span className="micro-label">SHAPE / 形状保真</span>
          <strong>{story.meta.shapeChain}</strong>
        </div>
        <div className="meaning-row">
          <span className="micro-label">MEANING / 含义</span>
          <p>{story.meta.meaning}</p>
        </div>
        <div className="foot-rule">
          <span>{story.meta.tag}</span>
          <span>{story.meta.operationCount} 次运算</span>
          <span>{story.expression}</span>
          {canSaveResult && (
            <button type="button" className="save-result-button" onClick={onSaveResult} title="把最终结果加入矩阵库，成为可继续组合的新对象">
              <Icon name="plus" size={10} /> 结果入库
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
