import * as THREE from 'three';
import { SLIDER_BEND } from '../core/track';
import type { Track } from '../core/types';

/** Number of slider slots the vertex shader can bend around at once (see updateBendSliders). */
const SLIDER_SLOTS = 4;

/** Shared uniform every bent material's shader points at (see applyWorldBend): SLIDER_SLOTS
 * Vector4 slots (x: z0, y: z1, z: valid flag [1 or 0], w: unused), refreshed every frame by
 * updateBendSliders so every already-compiled material picks up the current slider spans without
 * recompiling. */
export const bendUniforms = {
  uSliders: { value: Array.from({ length: SLIDER_SLOTS }, () => new THREE.Vector4()) },
};

/** Fills bendUniforms from the sliders of segments segmentIndexAt(z)-1 .. segmentIndexAt(z)+2
 * (SLIDER_SLOTS segments, clamped to index >= 0) - a slider never crosses a segment boundary, so
 * this always covers whatever slider span is currently visible around `z`. Call every frame,
 * before rendering (main.ts). */
export function updateBendSliders(track: Track, z: number): void {
  const base = track.segmentIndexAt(z) - 1;
  const slots = bendUniforms.uSliders.value;
  for (let k = 0; k < SLIDER_SLOTS; k++) {
    const slider = track.getSegment(Math.max(0, base + k)).slider;
    if (slider) slots[k].set(slider.z0, slider.z1, 1, 0);
    else slots[k].set(0, 0, 0, 0);
  }
}

/** GLSL `worldBendX(gameZ)`, matching core/track.ts's centerAt/sliderShape exactly for the
 * revised (2026-09-27 night) design: straight everywhere except inside a slider span, where the
 * centerline traces one full sine period fading in/out via smoothstep so both value and slope are
 * 0 at each end (no kink at the join with the straight track outside). SLIDER_BEND's constants
 * are embedded as literals. Declared once and prepended to every bent material's vertex shader. */
const WORLD_BEND_GLSL = `
uniform vec4 uSliders[${SLIDER_SLOTS}];
float worldBendX(float gameZ) {
  float bend = 0.0;
  for (int i = 0; i < ${SLIDER_SLOTS}; i++) {
    if (uSliders[i].z > 0.5) {
      float z0 = uSliders[i].x;
      float z1 = uSliders[i].y;
      float t = (gameZ - z0) / (z1 - z0);
      float w = smoothstep(0.0, ${SLIDER_BEND.blend.toFixed(4)}, gameZ - z0)
        * smoothstep(0.0, ${SLIDER_BEND.blend.toFixed(4)}, z1 - gameZ);
      bend += ${SLIDER_BEND.amp.toFixed(4)} * sin(6.283185307179586 * t) * w;
    }
  }
  return bend;
}
`;

/** Shape three's onBeforeCompile hands its callback (WebGLProgramParametersWithUniforms in newer
 * three typings); kept minimal/local so this file doesn't depend on a specific three version's
 * exported type name. */
interface BendableShader {
  uniforms: Record<string, unknown>;
  vertexShader: string;
}

/** Makes a compiled material's vertex shader bend world X by worldBendX(gameZ) (gameZ = -worldZ),
 * matching core/track.ts's centerAt (design doc §2). Materials with their own onBeforeCompile
 * (terrain.ts's withVoidDiscard) call this themselves; every other material gets it via the
 * THREE.Material.prototype.onBeforeCompile patch installed by installWorldBend. A no-op on
 * shaders that don't include the standard `<project_vertex>` chunk (e.g. the sky dome's raw
 * ShaderMaterial). */
export function applyWorldBend(shader: BendableShader): void {
  shader.uniforms.uSliders = bendUniforms.uSliders;
  shader.vertexShader = WORLD_BEND_GLSL + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `vec4 bentWorld = modelMatrix * vec4( transformed, 1.0 );
    bentWorld.x += worldBendX( -bentWorld.z );
    vec4 mvPosition = viewMatrix * bentWorld;
    gl_Position = projectionMatrix * mvPosition;`,
  );
}

/** Installs the world bend on every material by default (curved-track world bend, design doc
 * §2): patches THREE.Material.prototype.onBeforeCompile so any material without its own instance
 * override - and without `material.userData.noBend = true` - bends in the vertex shader. Call
 * once at startup, before any material is compiled (main.ts, right after createScene). */
export function installWorldBend(): void {
  const proto = THREE.Material.prototype as unknown as {
    onBeforeCompile: (this: THREE.Material, shader: BendableShader, renderer: THREE.WebGLRenderer) => void;
  };
  proto.onBeforeCompile = function (this: THREE.Material, shader: BendableShader): void {
    if (!this.userData.noBend) applyWorldBend(shader);
  };
}
