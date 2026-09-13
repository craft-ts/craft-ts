import type {
  SendContextEvent,
  SendContextPayload,
  SendContextTarget,
} from '@craft-ts/core';

/** What the chat puts in the clipboard when the user copies a prompt. */
export interface SendContextPromptOptions {
  readonly includeTargets: boolean;
  readonly includeComponent: boolean;
  readonly includeTimeline: boolean;
  readonly includeTimelineJson: boolean;
  readonly includeAppSnapshot: boolean;
  readonly includeDomStyles: boolean;
  readonly includePageDomStyles: boolean;
}

export const DEFAULT_SEND_CONTEXT_PROMPT_OPTIONS: SendContextPromptOptions = {
  includeTargets: true,
  includeComponent: true,
  includeTimeline: true,
  includeTimelineJson: false,
  includeAppSnapshot: true,
  includeDomStyles: false,
  includePageDomStyles: false,
};

/** A short, human-readable name for a captured element. */
export function describeTarget(target: SendContextTarget): string {
  if (target.selector) return target.selector;
  const text = (target.textContent ?? '').trim();
  return text
    ? `<${target.tagName}> ${text.slice(0, 40)}`
    : `<${target.tagName}>`;
}

/** `12:04:07.412 · http succeeded · getUser` — the timeline row and export line. */
export function formatEventLine(event: SendContextEvent): string {
  const time = new Date(event.timestamp).toISOString().slice(11, 23);
  const name = event.name ? ` · ${event.name}` : '';
  return `${time} · ${event.kind} ${event.phase}${name}`;
}

/** `JSON.stringify` that degrades to a marker instead of throwing. */
export function safeJson(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value, null, 2) ?? fallback;
  } catch {
    return fallback;
  }
}

export interface SendContextPromptInput {
  readonly instruction: string;
  readonly targets: readonly SendContextTarget[];
  readonly events: readonly SendContextEvent[];
  readonly payload?: SendContextPayload;
  readonly timelineJson?: string;
  readonly captures?: {
    readonly component?: unknown;
    readonly page?: unknown;
  };
}

/**
 * Renders the markdown prompt the user pastes into their AI assistant. Every
 * section is opt-in so a prompt stays small enough to be useful.
 */
export function buildSendContextPrompt(
  input: SendContextPromptInput,
  options: SendContextPromptOptions,
): string {
  const sections: string[] = ['# Instruction', input.instruction.trim(), ''];
  const payload = input.payload;
  const captures = input.captures ?? {};

  if (options.includeTargets && input.targets.length > 0) {
    sections.push(`# Selected elements (${input.targets.length})`);
    for (const target of input.targets) {
      sections.push(`## ${describeTarget(target)}`);
      const text = (target.textContent ?? '').trim();
      if (text) sections.push(`- textContent: ${JSON.stringify(text)}`);
      if (target.outerHTML) {
        sections.push('```html', target.outerHTML, '```');
      }
    }
    sections.push('');
  }

  if (options.includeComponent && payload) {
    sections.push(
      '# Component information',
      `- hostName: ${payload.hostName}`,
      `- tagList: ${safeJson(payload.tagList, '[]')}`,
      `- coords: (${payload.coords.x}, ${payload.coords.y})`,
      '',
      '# Component host outerHTML (truncated)',
      '```html',
      payload.outerHTML,
      '```',
      '',
    );
  }

  if (options.includeTimeline && input.events.length > 0) {
    sections.push(
      `# Timeline (${input.events.length} events)`,
      '```',
      input.events.map(formatEventLine).join('\n'),
      '```',
      '',
    );
  }

  if (options.includeTimelineJson && input.timelineJson) {
    sections.push(
      '# Timeline (JSON)',
      '```json',
      input.timelineJson,
      '```',
      '',
    );
  }

  if (options.includeDomStyles && captures.component !== undefined) {
    sections.push(
      '# Component DOM + computed CSS styles',
      '```json',
      safeJson(captures.component, '[unserializable capture]'),
      '```',
      '',
    );
  }

  if (options.includePageDomStyles && captures.page !== undefined) {
    sections.push(
      '# Full page DOM + computed CSS styles',
      '```json',
      safeJson(captures.page, '[unserializable capture]'),
      '```',
      '',
    );
  }

  if (options.includeAppSnapshot && payload && payload.snapshot.length > 0) {
    sections.push(
      `# App snapshot (${payload.snapshot.length} reports)`,
      '```json',
      safeJson(payload.snapshot, '[unserializable snapshot]'),
      '```',
      '',
    );
  }

  return sections.join('\n').trimEnd();
}
