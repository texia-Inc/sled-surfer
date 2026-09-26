import * as THREE from 'three';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  fog: THREE.Fog;
}

const SKY = 0x8ecdf5;

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  // No scene.background: the SkyDome (render/sky.ts) draws a procedural sky sphere instead.
  const fog = new THREE.Fog(SKY, 60, 220);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
  scene.add(camera);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(20, 40, 10);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xdff3ff, 0x8a9bb0, 1.2));

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return { renderer, scene, camera, fog };
}
