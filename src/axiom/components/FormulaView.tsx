import type { StoredMatrix } from '../../core/matrix.js';
import FormulaStudio from './FormulaStudio.js';

interface FormulaViewProps {
  matrices: readonly StoredMatrix[];
  onOpenInStage: (expression: string) => void;
}

export default function FormulaView({ matrices, onOpenInStage }: FormulaViewProps) {
  return (
    <div className="ax-formula-view">
      <header className="ax-formula-view-head">
        <div>
          <span className="ax-micro">FORMULA / TYPED AST</span>
          <h2>公式结构实验</h2>
          <p>先让符号通过类型检查，再把结构送入演算台。KaTeX 只负责排版，形状与类别来自本地 AST。</p>
        </div>
        <div className="ax-formula-view-meta">
          <span className="ax-chip sky">SESSION-ONLY</span>
        </div>
      </header>
      <div className="ax-formula-studio">
        <FormulaStudio matrices={matrices} onOpenInStage={onOpenInStage} />
      </div>
    </div>
  );
}
