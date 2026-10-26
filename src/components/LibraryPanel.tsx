import { useEffect, useRef, useState } from 'react';
import { Icon, BrandMark } from './Icons';
import { MatrixMini } from './MatrixPanel';
import type { StoredMatrix } from '../core/matrix.js';
import type { FormulaTemplate } from '../content/library.js';
import type { DebugFunctionDefinition } from '../debug/types.js';

type AssetTab = 'objects' | 'formulas' | 'algorithms';

interface LibraryPanelProps {
  matrices: readonly StoredMatrix[];
  formulas: readonly FormulaTemplate[];
  algorithms: readonly DebugFunctionDefinition[];
  projectName: string;
  onCreate: () => void;
  onEdit: (matrix: StoredMatrix) => void;
  onInsert: (name: string) => void;
  onOpenBlock: () => void;
  onReset: () => void;
  onExport: () => void;
  onOpenFormula: (templateId: string) => void;
  onOpenProjects: () => void;
  onOpenAlgorithm: (functionId: string) => void;
  onOpenAllFormulas: () => void;
  onOpenDebug: () => void;
  onOpenFormulaLab: () => void;
}

const TABS: Array<{ id: AssetTab; label: string; icon: string }> = [
  { id: 'objects', label: '对象', icon: 'grid' },
  { id: 'formulas', label: '公式', icon: 'template' },
  { id: 'algorithms', label: '算法', icon: 'function' },
];

export default function LibraryPanel({
  matrices,
  formulas,
  algorithms,
  projectName,
  onCreate,
  onEdit,
  onInsert,
  onOpenBlock,
  onReset,
  onExport,
  onOpenFormula,
  onOpenProjects,
  onOpenAlgorithm,
  onOpenAllFormulas,
  onOpenDebug,
  onOpenFormulaLab,
}: LibraryPanelProps) {
  const [tab, setTab] = useState<AssetTab>('objects');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [tab]);
  const counts: Record<AssetTab, number> = {
    objects: matrices.length,
    formulas: formulas.length,
    algorithms: algorithms.length,
  };
  const intro =
    tab === 'objects'
      ? {
          micro: 'OBJECTS / 项目对象',
          title: <>先有形状，<br />再谈变化。</>,
          note: '每一张矩阵都有自己的行列与含义。点一下，就能把它放进表达式。',
        }
      : tab === 'formulas'
        ? {
            micro: 'FORMULAS / 公式仓库',
            title: <>把证明过的结构，<br />拖进现场。</>,
            note: '公式资产固定形状与演算规则；具体矩阵仍然由你选择。',
          }
        : {
            micro: 'ALGORITHMS / 算法仓库',
            title: <>不是黑箱，<br />是可见的步骤。</>,
            note: '每个算法都是一个纯函数，可在调试台单独运行、检查与送入舞台。',
          };

  return (
    <aside className="library">
      <div className="library-brand">
        <div className="brand-row">
          <BrandMark />
          <div>
            <div className="brand-name">矩阵工坊</div>
            <div className="brand-sub">MATRIX ATELIER</div>
          </div>
        </div>
        <div className="brand-version">LAB · 01</div>
      </div>

      <button type="button" className="library-project" onClick={onOpenProjects} title="项目管理器">
        <Icon name="layers" size={12} />
        <span>{projectName}</span>
        <Icon name="chevron" size={11} />
      </button>

      <div className="library-intro">
        <span className="micro-label light">{intro.micro}</span>
        <h2>{intro.title}</h2>
        <p>{intro.note}</p>
      </div>

      <div className="asset-tabs" role="tablist" aria-label="资产类型">
        {TABS.map((item) => (
          <button
            type="button"
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            <Icon name={item.icon} size={13} />
            <span>{item.label}</span>
            <em>{counts[item.id]}</em>
          </button>
        ))}
      </div>

      <div className="library-heading">
        <div>
          <span className="library-count">{String(counts[tab]).padStart(2, '0')}</span>
          <span>{tab === 'objects' ? '个矩阵' : tab === 'formulas' ? '条公式' : '个算法'}</span>
        </div>
        {tab === 'objects' ? (
          <button type="button" className="icon-button light" onClick={onCreate} title="新建矩阵" aria-label="新建矩阵">
            <Icon name="plus" size={17} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-button light"
            onClick={tab === 'formulas' ? onOpenAllFormulas : onOpenDebug}
            title={tab === 'formulas' ? '打开公式仓库' : '打开调试控制台'}
            aria-label={tab === 'formulas' ? '打开公式仓库' : '打开调试控制台'}
          >
            <Icon name="arrow" size={15} />
          </button>
        )}
      </div>

      <div className="library-list" ref={listRef}>
        {tab === 'objects' &&
          matrices.map((matrix) => (
            <article key={matrix.id || matrix.name} className="matrix-card">
              <div className="matrix-card-head">
                <div className="matrix-card-title">
                  <strong>{matrix.name}</strong>
                  <span>{matrix.shape}</span>
                </div>
                <button
                  type="button"
                  className="card-edit"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(matrix);
                  }}
                  aria-label={`编辑矩阵 ${matrix.name}`}
                  title="编辑矩阵"
                >
                  <Icon name="edit" size={14} />
                </button>
              </div>
              <button type="button" className="matrix-card-main" onClick={() => onInsert(matrix.name)} title={`插入 ${matrix.name} 到表达式`}>
                <MatrixMini matrix={matrix} variant="dark" />
                <span className="card-note">{matrix.note || '自定义矩阵对象'}</span>
                <span className="insert-hint">
                  插入 <Icon name="arrow" size={12} />
                </span>
              </button>
            </article>
          ))}

        {tab === 'formulas' &&
          formulas.map((formula) => (
            <button
              type="button"
              key={formula.id}
              className={`asset-card formula-asset accent-${formula.accent}`}
              onClick={() => onOpenFormula(formula.id)}
            >
              <div className="asset-card-top">
                <span className="asset-symbol">{formula.symbol}</span>
                <span className="asset-category">{formula.category}</span>
              </div>
              <strong>{formula.title}</strong>
              <code>{formula.formula}</code>
              <span className="asset-open">配置并演算 <Icon name="arrow" size={11} /></span>
            </button>
          ))}

        {tab === 'algorithms' &&
          algorithms.map((algorithm) => (
            <button
              type="button"
              key={algorithm.id}
              className="asset-card algorithm-asset"
              onClick={() => onOpenAlgorithm(algorithm.id)}
            >
              <div className="asset-card-top">
                <span className="asset-signature">{algorithm.signature}</span>
                <span className="asset-category">{algorithm.group}</span>
              </div>
              <strong>{algorithm.name}</strong>
              <span className="asset-description">{algorithm.description}</span>
              <span className="asset-open">调试并观察 <Icon name="arrow" size={11} /></span>
            </button>
          ))}

        {tab === 'objects' && !matrices.length && (
          <div className="library-empty">矩阵库是空的。先造一个对象。</div>
        )}
        {tab === 'formulas' && !formulas.length && (
          <div className="library-empty">公式仓库还是空的。</div>
        )}
        {tab === 'algorithms' && !algorithms.length && (
          <div className="library-empty">算法注册表还是空的。</div>
        )}
      </div>

      <div className="library-actions">
        {tab === 'objects' ? (
          <>
            <button type="button" className="library-primary" onClick={onCreate}>
              <Icon name="plus" size={15} /> 新建矩阵
            </button>
            <button type="button" className="library-secondary" onClick={onOpenBlock}>
              <Icon name="grid" size={15} /> 分块组合
            </button>
          </>
        ) : tab === 'formulas' ? (
          <>
            <button type="button" className="library-primary" onClick={onOpenAllFormulas}>
              <Icon name="template" size={15} /> 打开公式仓库
            </button>
            <button type="button" className="library-secondary" onClick={onOpenFormulaLab}>
              <Icon name="code" size={15} /> 结构实验
            </button>
          </>
        ) : (
          <>
            <button type="button" className="library-primary" onClick={onOpenDebug}>
              <Icon name="function" size={15} /> 打开调试台
            </button>
            <button type="button" className="library-secondary" onClick={onOpenFormulaLab}>
              <Icon name="code" size={15} /> 结构实验
            </button>
          </>
        )}
      </div>

      <div className="library-footer">
        <div className="library-footer-row">
          <span className="library-status"><span className="status-dot ok" /> 精确有理数</span>
          <span className="library-status">本地运行</span>
        </div>
        <div className="library-footer-links">
          <button type="button" onClick={onExport}><Icon name="download" size={13} /> 导出实验</button>
          <button type="button" onClick={onReset}><Icon name="reset" size={13} /> 重置</button>
        </div>
        <div className="library-signature">MADE FOR SLOW LOOKING · {new Date().getFullYear()}</div>
      </div>
    </aside>
  );
}
