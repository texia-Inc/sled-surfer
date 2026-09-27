import * as THREE from 'three';
import { TRACK_BEND } from '../core/track';
import { ZONES } from '../core/zones';

/** Shared uniform every bent material's shader points at (see applyWorldBend): one Vector2
 * (p1, p2) updated in place by setBendPhases whenever a run (re)starts, so every already-compiled
 * material picks up the new track's phases without recompiling. */
export const bendUniforms = { uBendPhase: { value: new THREE.Vector2(0, 0) } };

/** Updates the shared bend phases for the current track (call on run start/restart with
 * track.bendPhases). */
export function setBendPhases(p1: number, p2: number): void {
  bendUniforms.uBendPhase.value.set(p1, p2);
}

/** Zone table for bendMulAt below, generated at module load from ZONES (canyon design §1) so it
 * can never drift out of sync with core/zones.ts's own bendMul values. */
const ZONE_COUNT = ZONES.length;
const ZONE_Z0_GLSL = ZONES.map((z) => z.z0.toFixed(1)).join(', ');
const ZONE_MUL_GLSL = ZONES.map((z) => z.bendMul.toFixed(4)).join(', ');

/** GLSL `worldBendX(gameZ)`, matching core/track.ts's centerAtPhases exactly (TRACK_BEND's
 * constants embedded as literals, fade = smoothstep(gameZ / fadeIn), scaled by bendMulAt(gameZ) -
 * a constant array + unrolled loop over the zone table above, matching core/track.ts's
 * bendMulAt). Declared once and prepended to every bent material's vertex shader. */
const WORLD_BEND_GLSL = `
uniform vec2 uBendPhase;
float bendMulAt(float gameZ) {
  float zoneZ0[${ZONE_COUNT}] = float[${ZONE_COUNT}](${ZONE_Z0_GLSL});
  float zoneMul[${ZONE_COUNT}] = float[${ZONE_COUNT}](${ZONE_MUL_GLSL});
  int idx = 0;
  for (int i = 0; i < ${ZONE_COUNT}; i++) {
    if (zoneZ0[i] <= gameZ) idx = i;
  }
  float mul = zoneMul[idx];
  if (idx > 0) {
    float t = clamp((gameZ - zoneZ0[idx]) / ${TRACK_BEND.zoneBlend.toFixed(4)}, 0.0, 1.0);
    float ts = t * t * (3.0 - 2.0 * t);
    mul = zoneMul[idx - 1] + (zoneMul[idx] - zoneMul[idx - 1]) * ts;
  }
  return mul;
}
float worldBendX(float gameZ) {
  float fadeT = clamp(gameZ / ${TRACK_BEND.fadeIn.toFixed(4)}, 0.0, 1.0);
  float fade = fadeT * fadeT * (3.0 - 2.0 * fadeT);
  float bend = ${TRACK_BEND.amp1.toFixed(4)} * sin(6.283185307179586 * gameZ / ${TRACK_BEND.wave1.toFixed(4)} + uBendPhase.x)
    + ${TRACK_BEND.amp2.toFixed(4)} * sin(6.283185307179586 * gameZ / ${TRACK_BEND.wave2.toFixed(4)} + uBendPhase.y);
  return bendMulAt(gameZ) * fade * bend;
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
  shader.uniforms.uBendPhase = bendUniforms.uBendPhase;
  shader.vertexShader = WORLD_BEND_GLSL + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `vec4 bentWorld = modelMatrix * vec4( transformed, 1.0 );
    bentWorld.x += worldBendX( -bentWorld.z );
    vec4 mvPosition = viewMatrix * bentWorld;
    gl_Position = projectionMatrix * mvPosition;`,
  );
}

/** Installs the world bend on every material by default (curved-track design doc §2): patches
 * THREE.Material.prototype.onBeforeCompile so any material without its own instance override -
 * and without `material.userData.noBend = true` - bends in the vertex shader. Call once at
 * startup, before any material is compiled (main.ts, right after createScene). */
export function installWorldBend(): void {
  const proto = THREE.Material.prototype as unknown as {
    onBeforeCompile: (this: THREE.Material, shader: BendableShader, renderer: THREE.WebGLRenderer) => void;
  };
  proto.onBeforeCompile = function (this: THREE.Material, shader: BendableShader): void {
    if (!this.userData.noBend) applyWorldBend(shader);
  };
}
