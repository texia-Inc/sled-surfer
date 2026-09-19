import './style.css';
import { Game } from './core/game';
import { loadProfile, saveProfile, type StorageLike } from './core/save';
import type { Phase } from './core/types';
import { InputController } from './input';
import { createScene } from './render/scene';
import { snapCamera, updateCamera } from './render/camera';
import { TerrainManager } from './render/terrain';
import { PropManager } from './render/props';
import { PlayerView } from './render/player';
import { Hud } from './ui/hud';
import { AimGauge } from './ui/aim';
import { ResultsPanel } from './ui/results';

const FIXED_DT = 1 / 120;
const MAX_STEPS = 4;
const EMPTY_COINS: ReadonlySet<string> = new Set<string>();

function getStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hasWebGL(canvas: HTMLCanvasElement): boolean {
  try {
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;

  if (!hasWebGL(canvas)) {
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

  const { renderer, scene, camera } = createScene(canvas);
  const terrain = new TerrainManager(scene, game.track);
  const props = new PropManager(scene, game.track, game.physicsParams());
  const player = new PlayerView(scene);
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
      snapCamera(camera, { x: 0, y: game.track.heightAt(0), z: 0, rocketing: false });
    },
  });

  snapCamera(camera, { x: 0, y: game.track.heightAt(0), z: 0, rocketing: false });

  let last = performance.now();
  let acc = 0;
  let lastPhase: Phase = game.phase;
  let steerShown = 0;
  let pullShown = 0;

  function frame(now: number): void {
    const frameDt = Math.min(0.1, (now - last) / 1000);
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

    let steps = 0;
    while (acc >= FIXED_DT && steps < MAX_STEPS) {
      game.update(FIXED_DT, { steer: snap.steer, rocket: snap.rocket && steps === 0 });
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
    steerShown += (snap.steer - steerShown) * Math.min(1, frameDt * 10);

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
    updateCamera(camera, { x, y, z, rocketing }, frameDt);
    hud.update(run, game.profile, game.phase);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot();
