import './style.css';
import * as THREE from 'three';
import { Game } from './core/game';
import { loadProfile, saveProfile, type StorageLike } from './core/save';
import type { Phase } from './core/types';
import type { CameraMode } from './core/cameraPose';
import { InputController } from './input';
import { createScene } from './render/scene';
import { snapCamera, updateCamera } from './render/camera';
import { TerrainManager } from './render/terrain';
import { PropManager } from './render/props';
import { PlayerView } from './render/player';
import { Effects } from './render/effects';
import { blendedThemeColor, themeAt } from './render/zoneTheme';
import { Hud } from './ui/hud';
import { AimGauge } from './ui/aim';
import { JoystickView } from './ui/joystick';
import { ResultsPanel } from './ui/results';

const FIXED_DT = 1 / 120;
const MAX_STEPS = 4;
const MAX_FRAME_DT = 0.1;
const STEER_SMOOTH_RATE = 10;
/** Camera shake is triggered by collisions only (terrain §2); boost/landing/break no longer
 * shake the camera. */
const SHAKE_STUN = 1.0;
/** Camera shake on a route-hazard wipeout (terrain routes §4), on top of any stun shake. */
const SHAKE_WIPEOUT = 0.8;
const EMPTY_COINS: ReadonlySet<string> = new Set<string>();
const CAMERA_MODE_KEY = 'sled-surfer:camera:v1';
const DEFAULT_CAMERA_MODE: CameraMode = 'full';
const FOG_LERP_RATE = 2;
/** How far ahead (m) the camera looks for slope, to tilt the look target before a descent. */
const CAMERA_SLOPE_AHEAD_DIST = 8;
/** How far before/after a Drop's span the camera treats the sled as "in the drop". */
const CAMERA_DROP_LOOK_BEFORE = 20;
const CAMERA_DROP_LOOK_AFTER = 10;

function getStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadCameraMode(storage: StorageLike | null): CameraMode {
  if (!storage) return DEFAULT_CAMERA_MODE;
  try {
    const v = storage.getItem(CAMERA_MODE_KEY);
    return v === 'mild' ? 'mild' : DEFAULT_CAMERA_MODE;
  } catch {
    return DEFAULT_CAMERA_MODE;
  }
}

function saveCameraMode(storage: StorageLike | null, mode: CameraMode): void {
  if (!storage) return;
  try {
    storage.setItem(CAMERA_MODE_KEY, mode);
  } catch {
    // ignore (private mode / quota)
  }
}

function hasWebGL2(): boolean {
  try {
    const probe = document.createElement('canvas');
    return !!probe.getContext('webgl2');
  } catch {
    return false;
  }
}

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;

  if (!hasWebGL2()) {
    const msg = document.createElement('div');
    msg.className = 'fatal';
    msg.textContent = 'このブラウザでは動作しません（WebGL が必要です）';
    ui.appendChild(msg);
    return;
  }

  const storage = getStorage();
  const game = new Game(loadProfile(storage), Date.now() % 100000, {
    onProfileChange: (p) => saveProfile(storage, p),
  });
  let cameraMode: CameraMode = loadCameraMode(storage);
  const groundAt = (gz: number, gx: number): number => game.track.heightAt(gz, gx);

  let created: ReturnType<typeof createScene>;
  try {
    created = createScene(canvas);
  } catch {
    const msg = document.createElement('div');
    msg.className = 'fatal';
    msg.textContent = 'このブラウザでは動作しません（WebGL が必要です）';
    ui.appendChild(msg);
    return;
  }
  const { renderer, scene, camera, fog } = created;
  const skyTmp = new THREE.Color();
  const fogTmp = new THREE.Color();
  const terrain = new TerrainManager(scene, game.track);
  const props = new PropManager(scene, game.track, game.physicsParams());
  const player = new PlayerView(scene);
  const effects = new Effects(scene, camera);
  const input = new InputController(canvas);
  const hud = new Hud(ui, () => input.pressRocket(), () => {
    cameraMode = cameraMode === 'full' ? 'mild' : 'full';
    hud.setCameraMode(cameraMode);
    saveCameraMode(storage, cameraMode);
  });
  hud.setCameraMode(cameraMode);
  const aim = new AimGauge(ui);
  const joystick = new JoystickView(ui);
  const results = new ResultsPanel(ui, {
    onBuy: (kind) => {
      if (game.buy(kind)) results.refresh(game.profile);
    },
    onRetry: () => {
      results.hide();
      game.restart();
      terrain.setTrack(game.track);
      props.setTrack(game.track);
      props.setGoal(game.profile.goalDistance);
      snapCamera(camera, {
        x: 0, y: game.track.heightAt(0), z: 0, rocketing: false, boosting: false, shake: 0,
        speed: 0, slopeAhead: 0, inDrop: false, mode: cameraMode, groundAt,
      });
    },
  });

  props.setGoal(game.profile.goalDistance);
  snapCamera(camera, {
    x: 0, y: game.track.heightAt(0), z: 0, rocketing: false, boosting: false, shake: 0,
    speed: 0, slopeAhead: 0, inDrop: false, mode: cameraMode, groundAt,
  });

  let last = performance.now();
  let acc = 0;
  let lastPhase: Phase = game.phase;
  let steerShown = 0;
  let pullShown = 0;
  let pendingRocket = false;
  let lastStunTime = 0;
  let lastWipeoutCount = 0;

  function frame(now: number): void {
    const frameDt = Math.min(MAX_FRAME_DT, (now - last) / 1000);
    last = now;
    acc += frameDt;

    input.phase = game.phase;
    input.update(frameDt);
    const snap = input.read();
    joystick.update(snap.joy);

    if (game.phase === 'aim') {
      pullShown = snap.pulling ? snap.pull : 0;
      aim.show(snap.pulling ? snap.pull : 0);
      if (snap.released) game.launch(snap.pull);
    } else {
      aim.hide();
      pullShown = 0;
    }

    if (snap.rocket) pendingRocket = true;

    let steps = 0;
    while (acc >= FIXED_DT && steps < MAX_STEPS) {
      game.update(FIXED_DT, { steer: snap.steer, rocket: pendingRocket });
      pendingRocket = false;
      acc -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_STEPS) acc = 0;

    if (game.phase === 'results' && lastPhase !== 'results' && game.lastResult) {
      results.show(game.lastResult, game.profile);
      // The goal may have advanced (applyResult already ran inside game.update); move the
      // finish gate now so it's positioned correctly before the next restart() builds a track.
      props.setGoal(game.profile.goalDistance);
    }
    lastPhase = game.phase;

    const run = game.run;
    const x = run ? run.x : 0;
    const z = run ? run.z : 0;
    const y = run ? run.y : game.track.heightAt(0);
    const rocketing = !!run && run.rocketTime > 0;
    const boosting = !!run && run.boostTime > 0;
    const speed = run ? Math.hypot(run.vx, run.vy, run.vz) : 0;
    steerShown += (snap.steer - steerShown) * Math.min(1, frameDt * STEER_SMOOTH_RATE);

    let shake = 0;
    if (run) {
      if (run.stunTime > 0 && lastStunTime === 0) shake = Math.max(shake, SHAKE_STUN);
      lastStunTime = run.stunTime;
      if (run.wipeoutCount > lastWipeoutCount) shake = Math.max(shake, SHAKE_WIPEOUT);
      lastWipeoutCount = run.wipeoutCount;
    } else {
      lastStunTime = 0;
      lastWipeoutCount = 0;
    }

    (scene.background as THREE.Color).copy(blendedThemeColor(z, (t) => t.sky, skyTmp));
    fog.color.copy(blendedThemeColor(z, (t) => t.fog, fogTmp));
    const fogTarget = themeAt(z);
    const fogK = Math.min(1, frameDt * FOG_LERP_RATE);
    fog.near += (fogTarget.fogNear - fog.near) * fogK;
    fog.far += (fogTarget.fogFar - fog.far) * fogK;

    const slopeAhead = run
      ? Math.max(-1, Math.min(1, game.track.slopeAt(z + CAMERA_SLOPE_AHEAD_DIST)))
      : 0;
    const inDrop = !!run && game.track.segmentsAround(z).some((seg) => seg.drops.some(
      (d) => z >= d.z - CAMERA_DROP_LOOK_BEFORE && z <= d.z + d.length + CAMERA_DROP_LOOK_AFTER,
    ));

    terrain.update(z);
    props.update(z, run ? run.collectedCoinIds : EMPTY_COINS, frameDt, run ? run.brokenObstacleIds : EMPTY_COINS);
    player.update({
      x, y, z,
      pitchSlope: game.track.slopeAt(z),
      airTime: run ? run.airTime : 0,
      grounded: run ? run.grounded : true,
      steer: steerShown,
      pullBack: pullShown,
      rocketing,
    });
    effects.update({
      x, y, z,
      speed,
      grounded: run ? run.grounded : true,
      boosting,
      boostHits: run ? run.boostCount : 0,
      landingCount: run ? run.landingCount : 0,
      hitCount: 0,
      breakCount: run ? run.breakCount : 0,
      wipeoutCount: run ? run.wipeoutCount : 0,
      dt: frameDt,
    });
    updateCamera(camera, { x, y, z, rocketing, boosting, shake, speed, slopeAhead, inDrop, mode: cameraMode, groundAt }, frameDt);
    hud.update(run, game.profile, game.phase);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot();
