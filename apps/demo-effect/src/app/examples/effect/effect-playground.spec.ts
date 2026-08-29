// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { Cause, Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectPlaygroundComponent from './effect-playground';
import {
  listTodos,
  removeTodo,
  TodoNotFound,
  TodoStoreLive,
} from './effect-playground-domain';

describe('demo: Effect playground', () => {
  let disposeBridge: () => void;

  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    disposeBridge = installCraftEffectBridge();
  });

  afterEach(() => {
    disposeBridge();
    TestBed.resetTestingModule();
  });

  it('loads and adds a todo through Effect resources', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const injector = TestBed.rootInjector.createChild([
      provideLayer(TodoStoreLive),
    ]);
    const mounted = mountCraftComponent(
      EffectPlaygroundComponent,
      element,
      injector as unknown as Injector,
    );
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Learn @craft-ts/effect');
    });

    const title = element.querySelector<HTMLInputElement>(
      '[data-craft-name="title"]',
    );
    const add = element.querySelector<HTMLButtonElement>(
      '[data-craft-name="add"]',
    );
    expect(title).not.toBeNull();
    expect(add).not.toBeNull();

    title!.value = 'Try mutationEffect';
    title!.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();
    add!.click();
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Try mutationEffect');
    });

    mounted.destroy();
    injector.destroy();
  });

  it('returns TodoNotFound without deleting another todo', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const before = yield* listTodos();
        const removal = yield* Effect.exit(removeTodo(999));
        const after = yield* listTodos();
        return { after, before, removal };
      }).pipe(Effect.provide(TodoStoreLive)),
    );

    expect(result.removal._tag).toBe('Failure');
    if (result.removal._tag !== 'Failure') return;
    const reason = result.removal.cause.reasons[0];
    expect(reason).toBeDefined();
    if (!reason || !Cause.isFailReason(reason)) return;
    expect(reason.error).toBeInstanceOf(TodoNotFound);
    expect(reason.error.id).toBe(999);
    expect(result.after).toEqual(result.before);
  });
});
