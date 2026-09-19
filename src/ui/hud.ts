import type { Phase, Profile, RunState } from '../core/types';

const TOAST_SECONDS = 1.2;

export class Hud {
  private readonly root: HTMLElement;
  private readonly dist: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly rocket: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private toastUntil = 0;
  private lastLandingCount = 0;

  constructor(parent: HTMLElement, onRocket: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="stat left"><span class="dist">0 m</span><small class="speed">0 km/h</small></div>
      <div class="stat right"><span class="coins">0</span><small>COINS</small></div>
      <div class="progress"><div class="fill"></div><div class="flag">🏁</div><div class="pct">0%</div></div>
      <button class="rocket" type="button">🚀</button>
      <div class="toast"></div>
    `;
    parent.appendChild(this.root);
    this.dist = this.root.querySelector<HTMLElement>('.dist')!;
    this.speed = this.root.querySelector<HTMLElement>('.speed')!;
    this.coins = this.root.querySelector<HTMLElement>('.coins')!;
    this.fill = this.root.querySelector<HTMLElement>('.fill')!;
    this.pct = this.root.querySelector<HTMLElement>('.pct')!;
    this.rocket = this.root.querySelector<HTMLButtonElement>('.rocket')!;
    this.toast = this.root.querySelector<HTMLElement>('.toast')!;
    this.rocket.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      onRocket();
    });
  }

  update(run: RunState | null, profile: Profile, phase: Phase): void {
    const distance = run ? run.distance : 0;
    const speed = run ? Math.sqrt(run.vx * run.vx + run.vy * run.vy + run.vz * run.vz) * 3.6 : 0;
    this.dist.textContent = `${Math.floor(distance)} m`;
    this.speed.textContent = `${Math.floor(speed)} km/h`;
    this.coins.textContent = `${profile.coins}${run && phase === 'run' ? ` +${run.coinsThisRun}` : ''}`;
    const ratio = Math.min(1, distance / profile.goalDistance);
    this.fill.style.height = `${ratio * 100}%`;
    this.pct.style.bottom = `${ratio * 100}%`;
    this.pct.textContent = `${Math.floor(ratio * 100)}%`;
    this.rocket.disabled = !(phase === 'run' && run !== null && run.rocketLeft > 0);

    if (run && run.landingCount !== this.lastLandingCount) {
      this.lastLandingCount = run.landingCount;
      this.toast.textContent = `NICE LANDING x${run.lastLandingBonus.toFixed(2)}`;
      this.toastUntil = performance.now() + TOAST_SECONDS * 1000;
    }
    if (!run) this.lastLandingCount = 0;
    this.toast.classList.toggle('on', performance.now() < this.toastUntil);
  }
}
