import type { Phase, Profile, RunState, ZoneId } from '../core/types';
import { ZONE_THEMES } from '../render/zoneTheme';
import { zoneAt } from '../core/zones';

const TOAST_SECONDS = 1.2;
const CHAIN_POP_SECONDS = 0.15;
const SPEED_WARN = 60;
const SPEED_HOT = 100;
const ZONE_BANNER_SECONDS = 2.0;

export class Hud {
  private readonly root: HTMLElement;
  private readonly dist: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly rocket: HTMLButtonElement;
  private readonly toast: HTMLElement;
  private readonly chain: HTMLElement;
  private readonly zone: HTMLElement;
  private toastUntil = 0;
  private lastLandingCount = 0;
  private chainPopUntil = 0;
  private lastBoostCount = 0;
  private lastZone: ZoneId | null = null;
  private zoneUntil = 0;

  constructor(parent: HTMLElement, onRocket: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="stat left"><span class="dist">0 m</span><small class="speed">0 km/h</small></div>
      <div class="stat right"><span class="coins">0</span><small>COINS</small></div>
      <div class="progress"><div class="fill"></div><div class="flag">🏁</div><div class="pct">0%</div></div>
      <button class="rocket" type="button">🚀</button>
      <div class="toast"></div>
      <div class="chain"></div>
      <div class="zone"></div>
    `;
    parent.appendChild(this.root);
    this.dist = this.root.querySelector<HTMLElement>('.dist')!;
    this.speed = this.root.querySelector<HTMLElement>('.speed')!;
    this.coins = this.root.querySelector<HTMLElement>('.coins')!;
    this.fill = this.root.querySelector<HTMLElement>('.fill')!;
    this.pct = this.root.querySelector<HTMLElement>('.pct')!;
    this.rocket = this.root.querySelector<HTMLButtonElement>('.rocket')!;
    this.toast = this.root.querySelector<HTMLElement>('.toast')!;
    this.chain = this.root.querySelector<HTMLElement>('.chain')!;
    this.zone = this.root.querySelector<HTMLElement>('.zone')!;
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
    this.speed.style.color = speed > SPEED_HOT ? '#ff6b3d' : speed > SPEED_WARN ? '#ffd23f' : '#fff';
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

    const chainActive = !!run && run.boostChainTime > 0 && run.boostChain > 0;
    if (run && run.boostCount !== this.lastBoostCount) {
      this.lastBoostCount = run.boostCount;
      this.chainPopUntil = performance.now() + CHAIN_POP_SECONDS * 1000;
    }
    if (!run) this.lastBoostCount = 0;
    if (chainActive) this.chain.textContent = `BOOST x${run.boostChain}`;
    this.chain.classList.toggle('on', chainActive);
    this.chain.classList.toggle('pop', performance.now() < this.chainPopUntil);

    if (!run) {
      this.lastZone = null;
    } else if (phase === 'run') {
      const z = zoneAt(run.distance);
      if (this.lastZone === null) {
        // First frame of the run: adopt the starting zone silently (no banner for it).
        this.lastZone = z.id;
      } else if (z.id !== this.lastZone) {
        this.lastZone = z.id;
        this.zone.textContent = z.nameJa;
        const gateColor = ZONE_THEMES[z.id].gate.getStyle();
        this.zone.style.color = '#fff';
        this.zone.style.textShadow = `0 0 12px ${gateColor}, 0 0 24px ${gateColor}`;
        this.zone.style.borderBottomColor = gateColor;
        this.zoneUntil = performance.now() + ZONE_BANNER_SECONDS * 1000;
      }
    }
    this.zone.classList.toggle('on', performance.now() < this.zoneUntil);
  }
}
