import type { Scene } from '../../scene/types.js';
import type { Selection } from '../../runtime/types.js';
import { SceneMatrix } from './MatrixViews.js';

interface FlatViewProps {
  scene: Scene | null;
  selection: Selection;
  onSelectNode: (nodeId: string) => void;
}

export default function FlatView({ scene, selection, onSelectNode }: FlatViewProps) {
  if (!scene) {
    return <div className="ax-view-surface"><div className="ax-empty-inline">No flat projection for this step.</div></div>;
  }
  const nodes = [...scene.nodes].sort((a, b) => a.stage - b.stage);
  const edgeByTarget = new Map(scene.edges.map((edge) => [edge.to, edge]));
  const selectedNode = selection?.kind === 'scene-node' ? selection.nodeId : null;

  return (
    <div className="ax-view-surface">
      <div className="ax-view-head">
        <div>
          <span className="ax-micro">FLAT / 平铺合成</span>
          <h3>{scene.title}</h3>
          <p>{scene.description}</p>
        </div>
        <span className="ax-chip">{scene.nodes.length} OBJECTS</span>
      </div>
      <div className="ax-flat-track">
        {nodes.map((node, index) => (
          <div className="ax-flat-step" key={node.id}>
            {index > 0 && (
              <div className="ax-flat-connector" aria-hidden="true">
                <span>{edgeByTarget.get(node.id)?.label ?? '→'}</span>
              </div>
            )}
            <button
              type="button"
              className={`ax-flat-node role-${node.role} status-${node.status} ${node.status === 'active' ? 'active' : ''} ${selectedNode === node.id ? 'selected' : ''}`}
              onClick={() => onSelectNode(node.id)}
            >
              <div className="ax-flat-node-top">
                <span className="ax-role">{node.role}</span>
                <span className="ax-small-label">{node.badge ?? ''}</span>
              </div>
              <strong>{node.label}</strong>
              {node.detail && <p>{node.detail}</p>}
              {node.matrix && <SceneMatrix matrix={node.matrix} />}
            </button>
          </div>
        ))}
      </div>
      <div className="ax-small-label">{scene.a11y.summary}</div>
    </div>
  );
}
