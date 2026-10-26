import { Icon } from '../../components/Icons.js';

export type ResourceMode = 'objects' | 'formulas' | 'algorithms' | 'runs';

interface ActivityRailProps {
  mode: ResourceMode;
  resourceOpen: boolean;
  counts: Record<ResourceMode, number>;
  onSelect: (mode: ResourceMode) => void;
  onToggleResource: () => void;
}

const ITEMS: Array<{ id: ResourceMode; label: string; icon: string }> = [
  { id: 'objects', label: 'Objects / 对象', icon: 'grid' },
  { id: 'formulas', label: 'Formulas / 公式', icon: 'template' },
  { id: 'algorithms', label: 'Algorithms / 算法', icon: 'function' },
  { id: 'runs', label: 'Runs / 运行', icon: 'table' },
];

export default function ActivityRail({ mode, resourceOpen, counts, onSelect, onToggleResource }: ActivityRailProps) {
  return (
    <nav className="ax-rail" aria-label="Axiom activity">
      <div className="ax-rail-group">
        {ITEMS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`ax-rail-button ${mode === item.id && resourceOpen ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
            title={item.label}
            aria-label={item.label}
            aria-current={mode === item.id && resourceOpen ? 'page' : undefined}
          >
            <Icon name={item.icon} size={17} strokeWidth={1.5} />
            <span className="ax-rail-count">{counts[item.id] || ''}</span>
          </button>
        ))}
      </div>
      <div className="ax-rail-group ax-rail-bottom">
        <button
          type="button"
          className={`ax-rail-button ${resourceOpen ? 'active' : ''}`}
          onClick={onToggleResource}
          title="Toggle resource dock"
          aria-label="Toggle resource dock"
        >
          <Icon name="panel" size={17} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
