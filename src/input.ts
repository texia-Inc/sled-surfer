import type { Phase } from './core/types';

export interface InputSnapshot {
  steer: number;
  rocket: boolean;
  pull: number;
  pulling: boolean;
  released: boolean;
  joy: { active: boolean; originX: number; originY: number; dx: number };
}

const PULL_DISTANCE_RATIO = 0.25;
const KEY_GAUGE_PERIOD = 1.2;
const JOY_RADIUS_PX = 60;

export class InputController {
  phase: Phase = 'aim';

  private keySteer = 0;
  private leftDown = false;
  private rightDown = false;
  private pointerSteer = 0;
  private pointerDown = false;
  private activePointerId: number | null = null;
  private joyActive = false;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private joyDx = 0;
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
  private readonly onPointerUp = (e: PointerEvent) => this.pointerUpHandler(e);

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
    if (this.phase !== 'aim') {
      this.spaceHeld = false;
      this.pulling = false;
    }
    if (this.phase !== 'run' && (this.joyActive || this.activePointerId !== null)) {
      this.activePointerId = null;
      this.joyActive = false;
      this.joyDx = 0;
      this.pointerSteer = 0;
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
      joy: {
        active: this.joyActive,
        originX: this.joyOriginX,
        originY: this.joyOriginY,
        dx: this.joyDx,
      },
    };
    this.rocketQueued = false;
    this.releasedQueued = false;
    return snap;
  }

  private updateKeySteer(): void {
    this.keySteer = (this.rightDown ? 1 : 0) - (this.leftDown ? 1 : 0);
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') e.preventDefault();
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
    } else if (this.phase === 'run' && this.activePointerId === null) {
      this.activePointerId = e.pointerId;
      this.joyActive = true;
      this.joyOriginX = e.clientX;
      this.joyOriginY = e.clientY;
      this.joyDx = 0;
      this.pointerSteer = 0;
    }
  }

  private pointerMoveHandler(e: PointerEvent): void {
    if (this.phase === 'aim' && this.pulling && !this.spaceHeld) {
      if (!this.pointerDown) return;
      const dy = e.clientY - this.pullStartY;
      this.pull = Math.max(0, Math.min(1, dy / (window.innerHeight * PULL_DISTANCE_RATIO)));
    } else if (this.phase === 'run' && this.joyActive && e.pointerId === this.activePointerId) {
      const dx = Math.max(-JOY_RADIUS_PX, Math.min(JOY_RADIUS_PX, e.clientX - this.joyOriginX));
      this.joyDx = dx;
      this.pointerSteer = dx / JOY_RADIUS_PX;
    }
  }

  private pointerUpHandler(e: PointerEvent): void {
    if (this.phase === 'run' && e.pointerId === this.activePointerId) {
      this.activePointerId = null;
      this.joyActive = false;
      this.joyDx = 0;
      this.pointerSteer = 0;
    }
    if (!this.pointerDown) return;
    this.pointerDown = false;
    if (this.phase === 'aim' && this.pulling && !this.spaceHeld) {
      this.pulling = false;
      this.releasedQueued = true;
    }
  }
}
