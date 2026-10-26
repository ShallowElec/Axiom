import { useMemo, useState } from 'react';
import type { Scene } from '../../scene/types.js';
import SceneMatrix from './SceneMatrix.js';

interface FlatSceneViewProps {
  scene: Scene;
}

export default function FlatSceneView({ scene }: FlatSceneViewProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const ordered = useMemo(() => [...scene.nodes].sort((a, b) => a.stage - b.stage), [scene]);
  const edgeByTarget = useMemo(
    () => new Map(scene.edges.map((edge) => [edge.to, edge])),
    [scene],
  );
  const selectedNode = scene.nodes.find((node) => node.id === selected);

  return (
    <div className="scene-view flat-scene">
      <div className="scene-toolbar">
        <div>
          <span className="micro-label">SYNTHESIS BENCH / 平铺合成</span>
          <h3>{scene.title}</h3>
          <p>{scene.description}</p>
        </div>
        <span className="scene-badge">{scene.nodes.length} 个对象 · 同一条时间游标</span>
      </div>

      <div className="flat-bench">
        <div className="flat-rails" aria-hidden="true">
          <span>INPUT STRAND</span>
          <span>OPERATOR WINDOW</span>
          <span>TRANSCRIPT</span>
        </div>
        <div className="flat-track">
          {ordered.map((node, index) => {
            const incoming = edgeByTarget.get(node.id);
            return (
              <div className="flat-step" key={node.id}>
                {index > 0 && (
                  <div className="flat-connector" aria-hidden="true">
                    <span>{incoming?.label ?? '→'}</span>
                  </div>
                )}
                <button
                  type="button"
                  className={`scene-node flat-node role-${node.role} status-${node.status} ${selected === node.id ? 'selected' : ''}`}
                  onClick={() => setSelected(node.id === selected ? null : node.id)}
                >
                  <div className="flat-node-top">
                    <span className="scene-role">{node.role}</span>
                    <span className="scene-badge">{node.badge}</span>
                  </div>
                  <strong>{node.label}</strong>
                  <p>{node.detail}</p>
                  {node.matrix && <SceneMatrix matrix={node.matrix} compact />}
                  {node.role === 'operation' && <span className="operation-sweep" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flat-footer">
        <div className="scene-legend">
          {scene.legend.map((item) => (
            <span key={item.role} className={`legend-${item.role}`}><i />{item.label}</span>
          ))}
        </div>
        {selectedNode ? (
          <span className="flat-selected">
            <b>{selectedNode.label}</b> · {selectedNode.detail} · {selectedNode.badge}
          </span>
        ) : (
          <span className="flat-selected muted">点击一个平铺对象查看读数</span>
        )}
      </div>
    </div>
  );
}
