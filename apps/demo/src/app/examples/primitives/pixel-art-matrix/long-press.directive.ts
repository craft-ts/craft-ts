import { Directive, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { type GetDeps } from '@craft-ng/core';

@Directive({
  selector: '[appLongPress]',
  standalone: true,
})
export class LongPressDirective {
  @Input('appLongPress') duration = 450;
  @Output() longPress = new EventEmitter<PointerEvent>();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private suppressClickOnce = false;
  private longPressTriggered = false;

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    this.clearTimer();
    this.longPressTriggered = false;
    this.suppressClickOnce = false;

    this.timer = setTimeout(() => {
      this.longPressTriggered = true;
      this.suppressClickOnce = true;
      this.longPress.emit(event);
    }, this.duration);
  }

  @HostListener('pointerup')
  @HostListener('pointercancel')
  @HostListener('pointerleave')
  onPointerEnd(): void {
    this.clearTimer();
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (!this.suppressClickOnce && !this.longPressTriggered) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.suppressClickOnce = false;
    this.longPressTriggered = false;
  }

  private clearTimer(): void {
    if (this.timer === null) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = null;
  }
}

export type GenDeps_LongPressDirective = GetDeps<{
      deps: {};
      provided: {};
    }>;
