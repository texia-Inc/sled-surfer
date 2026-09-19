import './style.css';
import * as THREE from 'three';
import { Game } from './core/game';
import { loadProfile, saveProfile, type StorageLike } from './core/save';
import type { Phase } from './core/types';
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
import { ResultsPanel } from './ui/results';

const FIXED_DT = 1 / 120;
const MAX_STEPS = 4;
const MAX_FRAME_DT = 0.1;
const STEER_SMOOTH_RATE = 10;
const SHAKE_BOOST = 0.6;
const SHAKE_LANDING = 0.5;
const SHAKE_STUN = 1.0;
const EMPTY_COINS: ReadonlySet<string> = new Set<string>();
const FOG_LERP_RATE = 2;

function getStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
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
  const hud = new Hud(ui, () => input.pressRocket());
  const aim = new AimGauge(ui);
  const results = new ResultsPanel(ui, {
    onBuy: (kind) => {
      if (game.buy(kind)) results.refresh(game.profile);
    },
    onRetry: () => {
      results.hide();
      game.restart();
      terrain.setTrack(game.track);
      props.setTrack(game.track);
      snapCamera(camera, { x: 0, y: game.track.heightAt(0), z: 0, rocketing: false, boosting: false, shake: 0 });
    },
  });

  snapCamera(camera, { x: 0, y: game.track.heightAt(0), z: 0, rocketing: false, boosting: false, shake: 0 });

  let last = performance.now();
  let acc = 0;
  let lastPhase: Phase = game.phase;
  let steerShown = 0;
  let pullShown = 0;
  let pendingRocket = false;
  let lastBoostCount = 0;
  let lastLandingCountShake = 0;
  let lastStunTime = 0;

  function frame(now: number): void {
    const frameDt = Math.min(MAX_FRAME_DT, (now - last) / 1000);
    last = now;
    acc += frameDt;

    input.phase = game.phase;
    input.update(frameDt);
    const snap = input.read();

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
      if (run.boostCount > lastBoostCount) shake = Math.max(shake, SHAKE_BOOST);
      if (run.landingCount > lastLandingCountShake) shake = Math.max(shake, SHAKE_LANDING);
      if (run.stunTime > 0 && lastStunTime === 0) shake = Math.max(shake, SHAKE_STUN);
      lastBoostCount = run.boostCount;
      lastLandingCountShake = run.landingCount;
      lastStunTime = run.stunTime;
    } else {
      lastBoostCount = 0;
      lastLandingCountShake = 0;
      lastStunTime = 0;
    }

    (scene.background as THREE.Color).copy(blendedThemeColor(z, (t) => t.sky, skyTmp));
    fog.color.copy(blendedThemeColor(z, (t) => t.fog, fogTmp));
    const fogTarget = themeAt(z);
    const fogK = Math.min(1, frameDt * FOG_LERP_RATE);
    fog.near += (fogTarget.fogNear - fog.near) * fogK;
    fog.far += (fogTarget.fogFar - fog.far) * fogK;

    terrain.update(z);
    props.update(z, run ? run.collectedCoinIds : EMPTY_COINS, frameDt);
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
      dt: frameDt,
    });
    updateCamera(camera, { x, y, z, rocketing, boosting, shake }, frameDt);
    hud.update(run, game.profile, game.phase);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot();
