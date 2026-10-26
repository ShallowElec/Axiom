import type { Scene } from '../../scene/types.js';
import FlatSceneView from './FlatSceneView.js';
import LayerSceneView from './LayerSceneView.js';

export default function SceneRenderer({ scene }: { scene: Scene }) {
  return scene.space === 'layered' ? <LayerSceneView scene={scene} /> : <FlatSceneView scene={scene} />;
}
