const RADIUS = 48;
const CIRC = 2 * Math.PI * RADIUS;

export class AimGauge {
  private readonly root: HTMLElement;
  private readonly arc: SVGCircleElement;
  private readonly pct: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'aim hidden';
    this.root.innerHTML = `
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="${RADIUS}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="10"/>
        <circle class="arc" cx="60" cy="60" r="${RADIUS}" fill="none" stroke="#27e1c1" stroke-width="10"
          stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/>
      </svg>
      <div class="pct">0%</div>
      <div class="hint">ドラッグして引く ／ Space 長押しで離す</div>
    `;
    parent.appendChild(this.root);
    this.arc = this.root.querySelector<SVGCircleElement>('.arc')!;
    this.pct = this.root.querySelector<HTMLElement>('.pct')!;
  }

  show(pull: number): void {
    this.root.classList.remove('hidden');
    const p = Math.max(0, Math.min(1, pull));
    this.arc.setAttribute('stroke-dashoffset', String(CIRC * (1 - p)));
    this.pct.textContent = `${Math.round(p * 100)}%`;
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
