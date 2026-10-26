import { expect, type Page } from '@playwright/test';

export type TemplateTraceEvent = {
  readonly phase?: string;
  readonly componentName?: string;
  readonly kind?: string;
  readonly name?: string;
  readonly renderCount?: number;
};

/** Captures the development-only Craft template trace emitted by the demo. */
export function captureTemplateTrace(page: Page): TemplateTraceEvent[] {
  const events: TemplateTraceEvent[] = [];

  page.on('console', async (message) => {
    if (!message.text().includes('[trace:template]')) return;

    for (const argument of message.args()) {
      try {
        const value: unknown = await argument.jsonValue();
        if (isTemplateTraceEvent(value)) events.push(value);
      } catch {
        // Browser console handles can become unavailable during navigation.
      }
    }
  });

  return events;
}

/** Waits for an update trace after an interaction and returns its evidence. */
export async function expectTemplateUpdate(
  events: readonly TemplateTraceEvent[],
  fromIndex: number,
): Promise<TemplateTraceEvent> {
  let update: TemplateTraceEvent | undefined;
  await expect
    .poll(() => {
      update = events
        .slice(fromIndex)
        .find((event) => event.phase === 'update');
      return update !== undefined;
    })
    .toBe(true);
  return update!;
}

function isTemplateTraceEvent(value: unknown): value is TemplateTraceEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'phase' in value &&
    typeof value.phase === 'string' &&
    'renderCount' in value &&
    typeof value.renderCount === 'number'
  );
}
