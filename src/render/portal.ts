import * as THREE from 'three';
import type { Gate } from '../core/types';
import { themeAt } from './zoneTheme';
import type { SkyDome } from './sky';

/** Metres ahead of a gate at which the destination view starts rendering into the ring at all
 * (real-portal design §2); beyond this the disc is invisible (a hole showing the current zone
 * through the ring) and the render-target pass is skipped entirely for performance. */
const PORTAL_VIEW_RANGE = 150;
/** How far ahead (world -z) of the main camera the portal camera looks from, so the destination
 * view roughly lines up with what the sled will see once it's through the ring. */
const PORTAL_VIEW_OFFSET = 40;
/** How far past the gate (game z) the destination sky is sampled, so the sky dome inside the
 * portal already reads as "the next zone" rather than the gate's own boundary lighting. */
const PORTAL_SKY_LOOKAHEAD = 60;
/** Render target width (px); height follows the drawing buffer's aspect ratio (design §2). */
const PORTAL_RT_WIDTH = 512;

const PORTAL_VERTEX = /* glsl */ `
#include <common>

void main() {
  #include <begin_vertex>
  #include <project_vertex>
}
`;

const PORTAL_FRAGMENT = /* glsl */ `
uniform sampler2D tPortal;
uniform vec2 uResolution;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  gl_FragColor = vec4(texture2D(tPortal, uv).rgb, 1.0);
  #include <colorspace_fragment>
}
`;

export interface PortalRenderInput {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  mainCamera: THREE.PerspectiveCamera;
  /** The sled's current game z, used only for the 150 m range test. */
  gameZ: number;
  /** The next gate ahead, or null when there isn't one loaded. */
  gate: Gate | null;
  /** The loaded disc mesh for `gate` (props.ts's PropManager.getGateDisc), or null. */
  disc: THREE.Object3D | null;
  /** Curved-track world bend (render/bend.ts design doc): track.centerAt. */
  centerAt: (z: number) => number;
  sky: SkyDome;
  fog: THREE.Fog;
  timeSec: number;
  /** Objects hidden for the render-target pass only (player mesh, speed lines). */
  hideGroups: THREE.Object3D[];
}

/**
 * Real portal (design doc): renders the destination zone into a render target and shows it
 * through the gate ring's disc, so the ring reads as a window into another world rather than a
 * translucent zone-coloured plane. `material` is shared by every gate disc (props.ts's
 * buildGate); `render` is called once per frame from main.ts, right before the main
 * `renderer.render(scene, camera)`.
 */
export class PortalView {
  readonly material: THREE.ShaderMaterial;
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly portalCamera: THREE.PerspectiveCamera;
  private readonly resolution = new THREE.Vector2();
  private readonly savedFogColor = new THREE.Color();
  private rtW = 0;
  private rtH = 0;

  constructor() {
    this.rt = new THREE.WebGLRenderTarget(PORTAL_RT_WIDTH, PORTAL_RT_WIDTH, { depthBuffer: true });
    this.portalCamera = new THREE.PerspectiveCamera();
    this.material = new THREE.ShaderMaterial({
      uniforms: { tPortal: { value: this.rt.texture }, uResolution: { value: this.resolution } },
      vertexShader: PORTAL_VERTEX,
      fragmentShader: PORTAL_FRAGMENT,
      fog: false,
    });
  }

  /** Resizes the render target to match the drawing buffer's current aspect ratio (width fixed at
   * PORTAL_RT_WIDTH, height scaled to match) - checked every call so a window resize is picked up
   * without main.ts needing its own listener. */
  private ensureRtSize(renderer: THREE.WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.resolution);
    const w = this.resolution.x;
    const h = this.resolution.y;
    if (w === this.rtW && h === this.rtH) return;
    this.rtW = w;
    this.rtH = h;
    const rtHeight = Math.max(1, Math.round((PORTAL_RT_WIDTH * h) / Math.max(1, w)));
    this.rt.setSize(PORTAL_RT_WIDTH, rtHeight);
  }

  render(input: PortalRenderInput): void {
    const {
      renderer, scene, mainCamera, gameZ, gate, disc, centerAt, sky, fog, timeSec, hideGroups,
    } = input;

    this.ensureRtSize(renderer);

    const d = gate ? gate.z - gameZ : -Infinity;
    const inRange = !!gate && d > 0 && d <= PORTAL_VIEW_RANGE;
    if (disc) disc.visible = inRange;
    // Early return when out of range (design §4): the RT pass only runs while a gate is close.
    if (!inRange || !gate || !disc) return;

    // Portal camera: a copy of the main camera (fov/aspect/near/far/quaternion), moved
    // PORTAL_VIEW_OFFSET metres ahead (world -z), with the world-bend x offset for that extra
    // distance added on top of the main camera's own (already-bent) x.
    this.portalCamera.copy(mainCamera, false);
    const camGameZ = -mainCamera.position.z;
    const dx = centerAt(camGameZ + PORTAL_VIEW_OFFSET) - centerAt(camGameZ);
    this.portalCamera.position.set(
      mainCamera.position.x + dx,
      mainCamera.position.y,
      mainCamera.position.z - PORTAL_VIEW_OFFSET,
    );
    this.portalCamera.updateProjectionMatrix();

    // Destination sky + fog: the zone just past the gate, sampled a little ahead so it already
    // reads as "the next zone" rather than the gate boundary itself.
    const destTheme = themeAt(gate.z + 1);
    this.savedFogColor.copy(fog.color);
    const savedNear = fog.near;
    const savedFar = fog.far;
    fog.color.copy(destTheme.fog);
    fog.near = destTheme.fogNear;
    fog.far = destTheme.fogFar;
    sky.update(gate.z + PORTAL_SKY_LOOKAHEAD, this.portalCamera.position, timeSec);

    for (const g of hideGroups) g.visible = false;
    disc.visible = false;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, this.portalCamera);
    renderer.setRenderTarget(prevTarget);

    for (const g of hideGroups) g.visible = true;
    disc.visible = true;

    fog.color.copy(this.savedFogColor);
    fog.near = savedNear;
    fog.far = savedFar;
  }

  dispose(): void {
    this.rt.dispose();
    this.material.dispose();
  }
}
