import type { Scene } from '../../scene/types.js';
import type { Selection } from '../../runtime/types.js';
import { SceneMatrix } from './MatrixViews.js';

interface LayersViewProps {
  scene: Scene | null;
  selection: Selection;
  onSelectNode: (nodeId: string) => void;
}

export default function LayersView({ scene, selection, onSelectNode }: LayersViewProps) {
  if (!scene) {
    return <div className="ax-view-surface"><div className="ax-empty-inline">No layered projection for this step.</div></div>;
  }
  const stages = [...new Set(scene.nodes.map((node) => node.stage))].sort((a, b) => a - b);
  const selectedNode = selection?.kind === 'scene-node' ? selection.nodeId : null;

  return (
    <div className="ax-view-surface">
      <div className="ax-view-head">
        <div>
          <span className="ax-micro">LAYERS / 执行层叠</span>
          <h3>{scene.title}</h3>
          <p>{scene.description}</p>
        </div>
        <span className="ax-chip">DEPTH {stages.length}</span>
      </div>
      <div className="ax-layers">
        {stages.map((stage, stageIndex) => {
          const nodes = scene.nodes.filter((node) => node.stage === stage);
          return (
            <div className="ax-layer" key={stage} style={{ '--layer-index': stageIndex } as React.CSSProperties}>
              <div className="ax-layer-index">
                <strong>{String(stage).padStart(2, '0')}</strong>
                <span>{stageIndex === 0 ? 'IN' : stageIndex === stages.length - 1 ? 'OUT' : 'OP'}</span>
              </div>
              <div className="ax-layer-nodes">
                {nodes.map((node) => (
                  <button
                    type="button"
                    key={node.id}
                    className={`ax-layer-node status-${node.status} ${node.status === 'active' ? 'active' : ''} ${selectedNode === node.id ? 'selected' : ''}`}
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
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ax-small-label">{scene.a11y.summary}</div>
    </div>
  );
}
