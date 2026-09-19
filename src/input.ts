import type { Phase } from './core/types';

export interface InputSnapshot {
  steer: number;
  rocket: boolean;
  pull: number;
  pulling: boolean;
  released: boolean;
}

const PULL_DISTANCE_RATIO = 0.25;
const KEY_GAUGE_PERIOD = 1.2;

export class InputController {
  phase: Phase = 'aim';

  private keySteer = 0;
  private leftDown = false;
  private rightDown = false;
  private pointerSteer = 0;
  private pointerDown = false;
  private pulling = false;
  private pullStartY = 0;
  private pull = 0;
  private spaceHeld = false;
  private gaugeTime = 0;
  private rocketQueued = false;
  private releasedQueued = false;
  private readonly target: HTMLElement;
  private readonly onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
  private readonly onKeyUp = (e: KeyboardEvent) => this.keyUp(e);
  private readonly onPointerDown = (e: PointerEvent) => this.pointerDownHandler(e);
  private readonly onPointerMove = (e: PointerEvent) => this.pointerMoveHandler(e);
  private readonly onPointerUp = () => this.pointerUpHandler();

  constructor(target: HTMLElement) {
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  pressRocket(): void {
    if (this.phase === 'run') this.rocketQueued = true;
  }

  update(dt: number): void {
    if (this.spaceHeld && this.phase === 'aim') {
      this.gaugeTime += dt;
      this.pull = 0.5 - 0.5 * Math.cos((2 * Math.PI * this.gaugeTime) / KEY_GAUGE_PERIOD);
      this.pulling = true;
    }
    if (this.phase !== 'aim' && !this.spaceHeld) {
      this.pulling = false;
    }
  }

  read(): InputSnapshot {
    const steer = this.keySteer !== 0 ? this.keySteer : this.pointerSteer;
    const snap: InputSnapshot = {
      steer,
      rocket: this.rocketQueued,
      pull: this.pull,
      pulling: this.pulling,
      released: this.releasedQueued,
    };
    this.rocketQueued = false;
    this.releasedQueued = false;
    return snap;
  }

  private updateKeySteer(): void {
    this.keySteer = (this.rightDown ? 1 : 0) - (this.leftDown ? 1 : 0);
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.leftDown = true;
        this.updateKeySteer();
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.rightDown = true;
        this.updateKeySteer();
        break;
      case 'Space':
        e.preventDefault();
        if (this.phase === 'aim' && !this.pulling) {
          this.spaceHeld = true;
          this.gaugeTime = 0;
          this.pull = 0;
          this.pulling = true;
        } else if (this.phase === 'run') {
          this.rocketQueued = true;
        }
        break;
    }
  }

  private keyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.leftDown = false;
        this.updateKeySteer();
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.rightDown = false;
        this.updateKeySteer();
        break;
      case 'Space':
        if (this.spaceHeld) {
          this.spaceHeld = false;
          if (this.phase === 'aim') this.releasedQueued = true;
          this.pulling = false;
        }
        break;
    }
  }

  private pointerDownHandler(e: PointerEvent): void {
    this.pointerDown = true;
    if (this.phase === 'aim' && !this.spaceHeld) {
      this.pulling = true;
      this.pullStartY = e.clientY;
      this.pull = 0;
    } else if (this.phase === 'run') {
      this.pointerSteer = this.steerFromX(e.clientX);
    }
  }

  private pointerMoveHandler(e: PointerEvent): void {
    if (!this.pointerDown) return;
    if (this.phase === 'aim' && this.pulling && !this.spaceHeld) {
      const dy = e.clientY - this.pullStartY;
      this.pull = Math.max(0, Math.min(1, dy / (window.innerHeight * PULL_DISTANCE_RATIO)));
    } else if (this.phase === 'run') {
      this.pointerSteer = this.steerFromX(e.clientX);
    }
  }

  private pointerUpHandler(): void {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    this.pointerSteer = 0;
    if (this.phase === 'aim' && this.pulling && !this.spaceHeld) {
      this.pulling = false;
      this.releasedQueued = true;
    }
  }

  private steerFromX(clientX: number): number {
    const half = window.innerWidth / 2;
    return Math.max(-1, Math.min(1, (clientX - half) / half));
  }
}
