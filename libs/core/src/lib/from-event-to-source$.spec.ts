import { beforeEach, describe, expect, it } from 'vitest';
import { fromEventToSource$, FromEventToSource$ } from './from-event-to-source$';
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';

describe('fromEventToSource$', () => {
  let button: HTMLButtonElement;

  beforeEach(() => {
    button = document.createElement('button');
    document.body.appendChild(button);
  });

  it('should create a readonly source that updates on event', () => {
    let eventSource$!: FromEventToSource$<MouseEvent>;
    TestBed.runInInjectionContext(() => {
      eventSource$ = fromEventToSource$<MouseEvent>(button, 'click');
    });

    expect(eventSource$.value()).toBe(undefined);

    const clickEvent = new MouseEvent('click');
    button.dispatchEvent(clickEvent);
    expect(eventSource$.value()).toBe(clickEvent);
  });

  it('should emit events to subscribers', () => {
    let eventSource$!: FromEventToSource$<MouseEvent>;
    TestBed.runInInjectionContext(() => {
      eventSource$ = fromEventToSource$<MouseEvent>(button, 'click');
    });

    let receivedEvent: MouseEvent | undefined;
    eventSource$.subscribe((event) => {
      receivedEvent = event;
    });

    const clickEvent = new MouseEvent('click');
    button.dispatchEvent(clickEvent);

    expect(receivedEvent).toBe(clickEvent);
    expect(eventSource$.value()).toBe(clickEvent);
  });

  it('should remove listener when disposed manually', () => {
    let eventSource$!: FromEventToSource$<MouseEvent>;
    TestBed.runInInjectionContext(() => {
      eventSource$ = fromEventToSource$<MouseEvent>(button, 'click');
    });

    // Verify initial state
    expect(eventSource$.value()).toBe(undefined);

    // Fire an event to confirm listener is active
    const clickEvent = new MouseEvent('click');
    button.dispatchEvent(clickEvent);
    expect(eventSource$.value()).toBe(clickEvent);

    // Dispose manually
    eventSource$.dispose();

    // Fire another event - it should not update the signal
    const clickEvent2 = new MouseEvent('click');
    button.dispatchEvent(clickEvent2);
    expect(eventSource$.value()).toBe(clickEvent); // Should still be the first event
  });

  it('should call dispose when DestroyRef triggers onDestroy', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      eventSource$ = fromEventToSource$<MouseEvent>(button, 'click');
    }

    TestBed.configureTestingModule({
      imports: [TestComponent],
    });

    const fixture = TestBed.createComponent(TestComponent);
    const component = fixture.componentInstance;

    // Verify initial state and listener works
    expect(component.eventSource$.value()).toBe(undefined);
    const clickEvent = new MouseEvent('click');
    button.dispatchEvent(clickEvent);
    expect(component.eventSource$.value()).toBe(clickEvent);

    // Destroy the component (this should trigger DestroyRef.onDestroy)
    fixture.destroy();

    // Fire another event - it should not update the signal after component destruction
    const clickEvent2 = new MouseEvent('click');
    button.dispatchEvent(clickEvent2);
    expect(component.eventSource$.value()).toBe(clickEvent); // Should still be the first event
  });

  it('should create a readonly source with computed value', () => {
    let eventSource$!: FromEventToSource$<{
      offsetX: number;
      offsetY: number;
    }>;
    TestBed.runInInjectionContext(() => {
      eventSource$ = fromEventToSource$(button, 'click', {
        computedValue: (event: MouseEvent) => ({
          offsetX: event.offsetX,
          offsetY: event.offsetY,
        }),
      });
    });

    expect(eventSource$.value()).toBe(undefined);

    const clickEvent = new MouseEvent('click');
    button.dispatchEvent(clickEvent);
    expect(eventSource$.value()).toEqual({
      offsetX: clickEvent.offsetX,
      offsetY: clickEvent.offsetY,
    });
  });

  it('should emit computed values to subscribers', () => {
    let eventSource$!: FromEventToSource$<string>;
    TestBed.runInInjectionContext(() => {
      eventSource$ = fromEventToSource$(button, 'click', {
        computedValue: (event: MouseEvent) => `Clicked at ${event.clientX}, ${event.clientY}`,
      });
    });

    let receivedValue: string | undefined;
    eventSource$.subscribe((value) => {
      receivedValue = value;
    });

    const clickEvent = new MouseEvent('click', { clientX: 100, clientY: 200 });
    button.dispatchEvent(clickEvent);

    expect(receivedValue).toBe('Clicked at 100, 200');
    expect(eventSource$.value()).toBe('Clicked at 100, 200');
  });

  it('should work with custom event listener options', () => {
    let captureEventSource$!: FromEventToSource$<MouseEvent>;
    const capturedEvents: MouseEvent[] = [];

    TestBed.runInInjectionContext(() => {
      captureEventSource$ = fromEventToSource$<MouseEvent>(button, 'click', {
        event: { capture: true },
      });
    });

    captureEventSource$.subscribe((event) => {
      capturedEvents.push(event);
    });

    const clickEvent = new MouseEvent('click');
    button.dispatchEvent(clickEvent);

    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0]).toBe(clickEvent);
  });

  it('should handle multiple subscribers', () => {
    let eventSource$!: FromEventToSource$<MouseEvent>;
    TestBed.runInInjectionContext(() => {
      eventSource$ = fromEventToSource$<MouseEvent>(button, 'click');
    });

    const events1: MouseEvent[] = [];
    const events2: MouseEvent[] = [];

    eventSource$.subscribe((event) => events1.push(event));
    eventSource$.subscribe((event) => events2.push(event));

    const clickEvent1 = new MouseEvent('click');
    button.dispatchEvent(clickEvent1);

    const clickEvent2 = new MouseEvent('click');
    button.dispatchEvent(clickEvent2);

    expect(events1).toHaveLength(2);
    expect(events2).toHaveLength(2);
    expect(events1[0]).toBe(clickEvent1);
    expect(events2[1]).toBe(clickEvent2);
  });

  it('should not allow emitting (readonly)', () => {
    let eventSource$!: FromEventToSource$<MouseEvent>;
    TestBed.runInInjectionContext(() => {
      eventSource$ = fromEventToSource$<MouseEvent>(button, 'click');
    });

    // TypeScript should prevent this, but we can verify at runtime
    // that there's no emit method exposed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((eventSource$ as any).emit).toBe(undefined);
  });
});
