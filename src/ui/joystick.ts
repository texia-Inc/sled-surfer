import type { InputSnapshot } from '../input';

export class JoystickView {
  private readonly root: HTMLElement;
  private readonly knob: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'joy hidden';
    this.root.innerHTML = '<div class="knob"></div>';
    parent.appendChild(this.root);
    this.knob = this.root.querySelector<HTMLElement>('.knob')!;
  }

  update(joy: InputSnapshot['joy']): void {
    this.root.classList.toggle('hidden', !joy.active);
    if (!joy.active) return;
    this.root.style.left = `${joy.originX}px`;
    this.root.style.top = `${joy.originY}px`;
    this.knob.style.transform = `translate(calc(-50% + ${joy.dx}px), -50%)`;
  }
}
