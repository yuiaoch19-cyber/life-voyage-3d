// 灯光与环境：给物理材质干净的反射，给 X-ray 层留暗背景
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function setupLights(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  scene.add(new THREE.HemisphereLight(0xcadcf5, 0x1a1428, 0.6));

  const key = new THREE.DirectionalLight(0xfff4e6, 1.9);
  key.position.set(2.2, 4.0, 3.0);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x9fd4ff, 0.8);
  rim.position.set(-3.0, 2.0, -2.6);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xa78bfa, 0.35);
  fill.position.set(0.0, 0.5, -4.0);
  scene.add(fill);

  // 环境反射（器官的 clearcoat 需要一点"世界"才好看）
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
  pmrem.dispose();
  return { env, key };
}
