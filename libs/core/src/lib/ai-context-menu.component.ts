import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  inject,
  input,
} from '@angular/core';

@Component({
  selector: 'craft-ai-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="craft-ai-menu"
      [style.left.px]="x()"
      [style.top.px]="y()"
      (click)="$event.stopPropagation()"
      (contextmenu)="$event.preventDefault()"
    >
      <button type="button" class="craft-ai-menu-item" (click)="select.emit()">
        <span aria-hidden="true">✨</span>
        <span>Send to IA</span>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 99998;
        pointer-events: none;
      }
      .craft-ai-menu {
        position: fixed;
        min-width: 180px;
        background: #ffffff;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        padding: 4px;
        pointer-events: auto;
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        font-size: 13px;
        color: #111827;
      }
      .craft-ai-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 10px;
        background: transparent;
        border: none;
        text-align: left;
        cursor: pointer;
        border-radius: 4px;
      }
      .craft-ai-menu-item:hover {
        background: #f3f4f6;
      }
    `,
  ],
})
export class AiContextMenuComponent {
  readonly x = input<number>(0);
  readonly y = input<number>(0);

  @Output() readonly select = new EventEmitter<void>();
  @Output() readonly dismiss = new EventEmitter<void>();

  private readonly hostEl = inject(ElementRef).nativeElement as HTMLElement;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.hostEl.contains(event.target as Node)) {
      this.dismiss.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.dismiss.emit();
  }
}
