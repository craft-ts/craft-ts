import { beforeEach, describe, expect, it } from 'vitest';
import { sourceFromEvent, SourceFromEvent } from './source-from-event';
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';

describe('sourceFromEvent', () => {
  let button: HTMLButtonElement;

  beforeEach(() => {
    button = document.createElement('button');
    document.body.appendChild(button);
  });

  it('should create a signal source that updates on event', () => {
    let eventSource!: SourceFromEvent<MouseEvent>;
    TestBed.runInInjectionContext(() => {
      eventSource = sourceFromEvent<MouseEvent>(button, 'click');
    });
    expect(eventSource()).toBe(undefined);

    const clickEvent = new MouseEvent('click');
    button.dispatchEvent(clickEvent);
    expect(eventSource()).toBe(clickEvent);
  });

  it('should remove listener when disposed manually', () => {
    let eventSource!: SourceFromEvent<MouseEvent>;
    TestBed.runInInjectionContext(() => {
      eventSource = sourceFromEvent<MouseEvent>(button, 'click');
    });

    // Verify initial state
    expect(eventSource()).toBe(undefined);

    // Fire an event to confirm listener is active
    const clickEvent = new MouseEvent('click');
    button.dispatchEvent(clickEvent);
    expect(eventSource()).toBe(clickEvent);

    // Dispose manually
    eventSource.dispose();

    // Fire another event - it should not update the signal
    const clickEvent2 = new MouseEvent('click');
    button.dispatchEvent(clickEvent2);
    expect(eventSource()).toBe(clickEvent); // Should still be the first event
  });

  it('should call dispose when DestroyRef triggers onDestroy', () => {
    @Component({
      template: '',
      standalone: true,
    })
    class TestComponent {
      eventSource = sourceFromEvent<MouseEvent>(button, 'click');
    }

    TestBed.configureTestingModule({
      imports: [TestComponent],
    });

    const fixture = TestBed.createComponent(TestComponent);
    const component = fixture.componentInstance;

    // Verify initial state and listener works
    expect(component.eventSource()).toBe(undefined);
    const clickEvent = new MouseEvent('click');
    button.dispatchEvent(clickEvent);
    expect(component.eventSource()).toBe(clickEvent);

    // Destroy the component (this should trigger DestroyRef.onDestroy)
    fixture.destroy();

    // Fire another event - it should not update the signal after component destruction
    const clickEvent2 = new MouseEvent('click');
    button.dispatchEvent(clickEvent2);
    expect(component.eventSource()).toBe(clickEvent); // Should still be the first event
  });

  it('should create a signal source that updates on event and use computed value', () => {
    let eventSource!: SourceFromEvent<{
      offsetX: number;
      offsetY: number;
    }>;
    TestBed.runInInjectionContext(() => {
      eventSource = sourceFromEvent(button, 'click', {
        computedValue: (event: MouseEvent) => ({
          offsetX: event.offsetX,
          offsetY: event.offsetY,
        }),
      });
    });
    expect(eventSource()).toBe(undefined);

    const clickEvent = new MouseEvent('click');
    button.dispatchEvent(clickEvent);
    expect(eventSource()).toEqual({
      offsetX: clickEvent.offsetX,
      offsetY: clickEvent.offsetY,
    });
  });
});
