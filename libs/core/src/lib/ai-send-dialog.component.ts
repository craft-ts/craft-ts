import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Output,
  input,
  signal,
} from '@angular/core';
import { type SendContextPayload } from './send-context-to-ai.tokens';

@Component({
  selector: 'craft-ai-send-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="craft-ai-overlay" (click)="onOverlayClick()">
      <div class="craft-ai-card" (click)="$event.stopPropagation()">
        <header class="craft-ai-header">
          <strong>Send context to AI</strong>
          <button
            type="button"
            class="craft-ai-close"
            (click)="requestClose()"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <section class="craft-ai-context">
          <div><span class="label">Component:</span> {{ payload().hostName }}</div>
          <div>
            <span class="label">Coords:</span>
            ({{ payload().coords.x }}, {{ payload().coords.y }})
          </div>
          <div>
            <span class="label">Snapshot:</span>
            {{ payload().snapshot.length }} report(s)
          </div>
        </section>

        <label class="craft-ai-label" for="craft-ai-instruction">
          Instruction
        </label>
        <textarea
          id="craft-ai-instruction"
          class="craft-ai-textarea"
          rows="6"
          [value]="instruction()"
          (input)="instruction.set(textareaValue($event))"
          placeholder="Describe what you want the AI to do…"
        ></textarea>

        @if (copied()) {
          <div class="craft-ai-success">Copié dans le presse-papier ✓</div>
        }

        <footer class="craft-ai-footer">
          <button
            type="button"
            class="craft-ai-cancel"
            (click)="requestClose()"
          >
            Fermer
          </button>
          <button
            type="button"
            class="craft-ai-copy"
            (click)="copy()"
            [disabled]="!instruction().trim()"
            [class.craft-ai-copy--done]="copied()"
          >
            @if (copied()) {
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Copié</span>
            } @else {
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
              <span>Copier</span>
            }
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 99999;
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        font-size: 13px;
        color: #111827;
      }
      .craft-ai-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .craft-ai-card {
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
        width: min(560px, 100%);
        max-height: 90vh;
        overflow: auto;
        padding: 16px 20px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .craft-ai-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 14px;
      }
      .craft-ai-close {
        background: transparent;
        border: none;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        color: #6b7280;
      }
      .craft-ai-context {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 8px 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        display: grid;
        gap: 4px;
      }
      .craft-ai-context .label {
        color: #6b7280;
        margin-right: 4px;
      }
      .craft-ai-label {
        font-weight: 600;
      }
      .craft-ai-textarea {
        width: 100%;
        box-sizing: border-box;
        font-family: inherit;
        font-size: 13px;
        padding: 8px 10px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        resize: vertical;
        min-height: 96px;
      }
      .craft-ai-textarea:focus {
        outline: 2px solid #3b82f6;
        outline-offset: -1px;
      }
      .craft-ai-success {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #065f46;
        padding: 8px 10px;
        border-radius: 6px;
      }
      .craft-ai-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .craft-ai-cancel {
        background: #ffffff;
        border: 1px solid #d1d5db;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
      }
      .craft-ai-copy {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #2563eb;
        color: #ffffff;
        border: none;
        padding: 6px 14px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: background 0.15s;
      }
      .craft-ai-copy--done {
        background: #059669;
      }
      .craft-ai-copy:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `,
  ],
})
export class AiSendDialogComponent {
  readonly payload = input.required<SendContextPayload>();

  @Output() readonly close = new EventEmitter<void>();

  protected readonly instruction = signal('');
  protected readonly copied = signal(false);

  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close.emit();
  }

  protected onOverlayClick() {
    this.close.emit();
  }

  protected requestClose() {
    this.close.emit();
  }

  protected textareaValue(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected copy() {
    const text = this.instruction().trim();
    if (!text) return;

    const content = this.formatPrompt({ ...this.payload(), instruction: text });
    navigator.clipboard.writeText(content).then(() => {
      this.copied.set(true);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2500);
    });
  }

  private formatPrompt(
    payload: SendContextPayload & { instruction: string },
  ): string {
    const snapshotJson = (() => {
      try {
        return JSON.stringify(payload.snapshot, null, 2);
      } catch {
        return '[unserializable snapshot]';
      }
    })();
    return [
      `# Instruction`,
      payload.instruction,
      ``,
      `# Component clicked`,
      `- hostName: ${payload.hostName}`,
      `- tagList: ${JSON.stringify(payload.tagList)}`,
      `- coords: (${payload.coords.x}, ${payload.coords.y})`,
      ``,
      `# Element outerHTML (truncated)`,
      '```html',
      payload.outerHTML,
      '```',
      ``,
      `# App snapshot (${payload.snapshot.length} reports)`,
      '```json',
      snapshotJson,
      '```',
    ].join('\n');
  }
}
