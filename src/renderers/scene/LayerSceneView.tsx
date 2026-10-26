import { useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Icon } from '../../components/Icons.js';
import type { Scene, SceneNode } from '../../scene/types.js';
import SceneMatrix from './SceneMatrix.js';

interface LayerSceneViewProps {
  scene: Scene;
}

interface DragState {
  x: number;
  y: number;
  rotX: number;
  rotY: number;
}

function groupByStage(scene: Scene): Array<{ stage: number; nodes: SceneNode[] }> {
  const map = new Map<number, SceneNode[]>();
  for (const node of scene.nodes) {
    const group = map.get(node.stage) ?? [];
    group.push(node);
    map.set(node.stage, group);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([stage, nodes]) => ({ stage, nodes }));
}

export default function LayerSceneView({ scene }: LayerSceneViewProps) {
  const [rotX, setRotX] = useState(8);
  const [rotY, setRotY] = useState(-4);
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const groups = useMemo(() => groupByStage(scene), [scene]);
  const selectedNode = scene.nodes.find((node) => node.id === selected);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, rotX, rotY };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    setRotY(Math.max(-22, Math.min(22, drag.current.rotY + dx * 0.08)));
    setRotX(Math.max(-2, Math.min(26, drag.current.rotX - dy * 0.08)));
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="scene-view layer-scene">
      <div className="scene-toolbar">
        <div>
          <span className="micro-label">LAYERED EXECUTION / 层叠执行</span>
          <h3>{scene.title}</h3>
        </div>
        <div className="scene-toolbar-actions">
          <button type="button" className="scene-chip" onClick={() => { setRotX(8); setRotY(-4); }}>
            <Icon name="reset" size={12} /> 视角
          </button>
          <span className="scene-hint">拖动旋转 · 点击层查看读数</span>
        </div>
      </div>

      <div className="layer-layout">
        <div
          className="layer-orbit"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ '--rot-x': `${rotX}deg`, '--rot-y': `${rotY}deg` } as React.CSSProperties}
        >
          <div className="layer-world">
            <div className="layer-axis">
              <span>INPUT</span>
              <span>PIPELINE DEPTH ↓</span>
              <span>OUTPUT</span>
            </div>
            {groups.map((group, groupIndex) => (
              <div
                key={group.stage}
                className="layer-stage"
                style={{
                  '--stage': groupIndex,
                  transform: `translateZ(${groupIndex * 22}px)`,
                } as React.CSSProperties}
              >
                <div className="layer-stage-label">
                  <span>{String(group.stage).padStart(2, '0')}</span>
                  <em>{group.stage === 0 ? '输入' : group.stage === groups.length - 1 ? '输出' : '计算层'}</em>
                </div>
                <div className="layer-stage-cards">
                  {group.nodes.map((node) => (
                    <button
                      type="button"
                      key={node.id}
                      className={`scene-node layer-node role-${node.role} status-${node.status} ${selected === node.id ? 'selected' : ''}`}
                      onClick={() => setSelected(node.id === selected ? null : node.id)}
                      style={{ '--lane': node.lane } as React.CSSProperties}
                    >
                      <div className="scene-node-head">
                        <span className="scene-role">{node.role}</span>
                        <span className="scene-badge">{node.badge}</span>
                      </div>
                      <strong>{node.label}</strong>
                      {node.detail && <p>{node.detail}</p>}
                      {node.matrix && <SceneMatrix matrix={node.matrix} compact />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="layer-flow-line" aria-hidden="true" />
          </div>
        </div>

        <aside className="scene-inspector">
          <span className="micro-label">NODE INSPECTOR / 层检查</span>
          {selectedNode ? (
            <>
              <div className={`scene-node-summary role-${selectedNode.role}`}>
                <span>{selectedNode.role}</span>
                <strong>{selectedNode.label}</strong>
                <em>{selectedNode.badge}</em>
              </div>
              <p>{selectedNode.detail}</p>
              {selectedNode.metrics && (
                <dl className="scene-metrics">
                  {Object.entries(selectedNode.metrics).map(([key, value]) => (
                    <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              )}
              {selectedNode.matrix && <SceneMatrix matrix={selectedNode.matrix} />}
            </>
          ) : (
            <p className="scene-empty-hint">点击任意一层，查看它的角色、形状与当前读数。</p>
          )}
          <div className="scene-legend">
            {scene.legend.map((item) => (
              <span key={item.role} className={`legend-${item.role}`}><i />{item.label}</span>
            ))}
          </div>
          <small>{scene.a11y.summary}</small>
        </aside>
      </div>
    </div>
  );
}
