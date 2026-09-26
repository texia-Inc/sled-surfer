import * as THREE from 'three';
import { SKY_THEMES, blendedSkyTheme, type SkyTheme } from './zoneTheme';

/** Camera-following sky dome radius (m); the camera far plane is 400 (render §3). */
const RADIUS = 360;
const WIDTH_SEGMENTS = 32;
const HEIGHT_SEGMENTS = 16;

const VERTEX_SHADER = /* glsl */ `
varying vec3 vWorld;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorld = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
varying vec3 vWorld;

uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunSize;
uniform float cloudAmount;
uniform float stars;
uniform float planet;
uniform vec3 planetDir;
uniform float time;

/** Hash of a 3-vector to a float in [0, 1). */
float hash13(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

/** Trilinear value noise over a 3-vector, in [0, 1). */
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

/** 3-octave value-noise fbm. */
float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += noise3(p) * amp;
    p *= 2.0;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec3 dir = normalize(vWorld - cameraPosition);

  vec3 color = mix(ground, horizon, smoothstep(-0.2, 0.05, dir.y));
  color = mix(color, zenith, smoothstep(0.05, 0.7, dir.y));

  // Guard against the degenerate sunSize == 0 case (no visible sun, e.g. cave/space) where
  // cos(sunSize) == cos(sunSize * 0.7) would make smoothstep's edges coincide.
  float size = max(sunSize, 0.0001);
  float d = dot(dir, sunDir);
  float disc = smoothstep(cos(size), cos(size * 0.7), d);
  float glow = pow(max(d, 0.0), 24.0) * 0.6 + pow(max(d, 0.0), 4.0) * 0.15;
  color += sunColor * (disc + glow);

  vec2 cloudUv = dir.xz / (dir.y + 0.15) * 1.5 + time * 0.01;
  float cloudMask = smoothstep(0.02, 0.15, dir.y) * (1.0 - smoothstep(0.35, 0.8, dir.y));
  float clouds = smoothstep(0.5, 0.75, fbm(vec3(cloudUv, 0.0))) * cloudAmount * cloudMask;
  color = mix(color, mix(vec3(1.0), horizon, 0.3), clouds);

  float h = hash13(floor(dir * 220.0));
  float star = step(0.995, h) * (0.6 + 0.4 * sin(time * 3.0 + h * 90.0));
  color += stars * star;

  float a = acos(clamp(dot(dir, planetDir), -1.0, 1.0));
  if (a < 0.75) {
    float landMix = smoothstep(0.5, 0.6, fbm(dir * 6.0));
    vec3 surf = mix(vec3(0.05, 0.2, 0.55), vec3(0.25, 0.45, 0.2), landMix);
    float swirl = smoothstep(0.55, 0.7, fbm(dir * 9.0 + time * 0.02));
    surf += vec3(1.0) * swirl * 0.5;
    float rim = smoothstep(0.55, 0.75, a);
    surf += vec3(0.5, 0.75, 1.0) * rim * 0.6;
    color = mix(color, surf, planet);
  }

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Camera-following procedural sky sphere (render §3). Replaces `scene.background`: drawn first
 * (renderOrder -1), doesn't write depth, and isn't affected by scene fog, so the terrain/props
 * always render in front of it.
 */
export class SkyDome {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly theme: SkyTheme = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    ground: new THREE.Color(),
    sunDir: new THREE.Vector3(),
    sunColor: new THREE.Color(),
    sunSize: 0,
    cloudAmount: 0,
    stars: 0,
    planet: 0,
    planetDir: new THREE.Vector3(),
  };

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.SphereGeometry(RADIUS, WIDTH_SEGMENTS, HEIGHT_SEGMENTS);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: SKY_THEMES.snowfield.zenith.clone() },
        horizon: { value: SKY_THEMES.snowfield.horizon.clone() },
        ground: { value: SKY_THEMES.snowfield.ground.clone() },
        sunDir: { value: SKY_THEMES.snowfield.sunDir.clone() },
        sunColor: { value: SKY_THEMES.snowfield.sunColor.clone() },
        sunSize: { value: SKY_THEMES.snowfield.sunSize },
        cloudAmount: { value: SKY_THEMES.snowfield.cloudAmount },
        stars: { value: SKY_THEMES.snowfield.stars },
        planet: { value: SKY_THEMES.snowfield.planet },
        planetDir: { value: SKY_THEMES.snowfield.planetDir.clone() },
        time: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = -1;
    this.mesh.matrixAutoUpdate = true;
    scene.add(this.mesh);
  }

  /** Recomputes the blended sky theme for `z` and pushes it into the shader uniforms. */
  update(z: number, cameraPos: THREE.Vector3, timeSec: number): void {
    blendedSkyTheme(z, this.theme);
    const u = this.material.uniforms;
    (u.zenith.value as THREE.Color).copy(this.theme.zenith);
    (u.horizon.value as THREE.Color).copy(this.theme.horizon);
    (u.ground.value as THREE.Color).copy(this.theme.ground);
    (u.sunDir.value as THREE.Vector3).copy(this.theme.sunDir);
    (u.sunColor.value as THREE.Color).copy(this.theme.sunColor);
    u.sunSize.value = this.theme.sunSize;
    u.cloudAmount.value = this.theme.cloudAmount;
    u.stars.value = this.theme.stars;
    u.planet.value = this.theme.planet;
    (u.planetDir.value as THREE.Vector3).copy(this.theme.planetDir);
    u.time.value = timeSec;
    this.mesh.position.copy(cameraPos);
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
