// 后期链：Render → Outline(悬停描边) → Output
// 无 bloom：哑光影棚风不需要泛光（用户反馈：发光刺眼）
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class PostFX {
  composer: EffectComposer;
  outline: OutlinePass;

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, width: number, height: number) {
    const rt = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));

    this.outline = new OutlinePass(new THREE.Vector2(width, height), scene, camera);
    this.outline.edgeStrength = 3.5;
    this.outline.edgeGlow = 0;
    this.outline.edgeThickness = 1.2;
    this.outline.visibleEdgeColor.set('#4fd8ee');
    this.outline.hiddenEdgeColor.set('#155e75');
    this.composer.addPass(this.outline);

    this.composer.addPass(new OutputPass());
    this.resize(width, height);
  }

  resize(width: number, height: number) {
    this.composer.setSize(width, height);
  }

  render(dt: number) { this.composer.render(dt); }
}
