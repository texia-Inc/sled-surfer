import type { Profile, RunResult, UpgradeKind } from '../core/types';
import { UPGRADE } from '../core/params';
import { UPGRADE_LABELS, canBuy, upgradeCost } from '../core/upgrades';

const KINDS: UpgradeKind[] = ['slingshot', 'sled', 'income'];

export class ResultsPanel {
  visible = false;
  private readonly root: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly buttons = new Map<UpgradeKind, HTMLButtonElement>();
  private readonly coinsLine: HTMLElement;

  constructor(parent: HTMLElement, handlers: { onBuy: (kind: UpgradeKind) => void; onRetry: () => void }) {
    this.root = document.createElement('div');
    this.root.className = 'panel hidden';
    this.root.innerHTML = `
      <div class="card">
        <h2>RESULT</h2>
        <div class="summary"></div>
        <div class="row total"><span>所持コイン</span><span class="wallet">0</span></div>
        <div class="shop"></div>
        <button class="retry" type="button">もう一度</button>
      </div>
    `;
    parent.appendChild(this.root);
    this.summary = this.root.querySelector<HTMLElement>('.summary')!;
    this.coinsLine = this.root.querySelector<HTMLElement>('.wallet')!;
    const shop = this.root.querySelector('.shop')!;
    for (const kind of KINDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.addEventListener('click', () => handlers.onBuy(kind));
      shop.appendChild(b);
      this.buttons.set(kind, b);
    }
    this.root.querySelector('.retry')!.addEventListener('click', () => handlers.onRetry());
  }

  show(result: RunResult, profile: Profile): void {
    this.summary.innerHTML = `
      <div class="row"><span>距離</span><span>${Math.floor(result.distance)} m ${result.newBest ? '<span class="badge">NEW BEST</span>' : ''}</span></div>
      <div class="row"><span>拾ったコイン</span><span>${result.coinsCollected}</span></div>
      <div class="row"><span>距離ボーナス</span><span>${result.distanceCoins}</span></div>
      ${result.goalReached ? '<div class="row"><span class="badge">GOAL CLEAR x2</span><span>次のゴール ' + profile.goalDistance + ' m</span></div>' : ''}
      <div class="row total"><span>獲得</span><span>+${result.earned}</span></div>
    `;
    this.refresh(profile);
    this.root.classList.remove('hidden');
    this.visible = true;
  }

  refresh(profile: Profile): void {
    this.coinsLine.textContent = String(profile.coins);
    for (const kind of KINDS) {
      const b = this.buttons.get(kind)!;
      const level = profile.upgrades[kind];
      const maxed = level >= UPGRADE.maxLevel;
      const label = UPGRADE_LABELS[kind];
      b.innerHTML = `<span><b>${label.name} Lv.${level}</b><small>${label.effect}</small></span><span>${maxed ? 'MAX' : `${upgradeCost(kind, level)} 🪙`}</span>`;
      b.disabled = !canBuy(profile, kind);
    }
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.visible = false;
  }
}
