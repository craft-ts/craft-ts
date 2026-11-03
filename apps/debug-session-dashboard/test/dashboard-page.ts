import { mountCraftComponent } from '@craft-ts/component';
import {
  CraftTestBed,
  ɵInjector as Injector,
  ɵinjectCraftRouterRuntime,
  ɵrunInInjectionContext,
} from '@craft-ts/core';
import { expect, inject, vi } from 'vitest';
import { appConfig } from '../src/app/app.config';
import { DebugSessionDashboard } from '../src/app/dashboard';

/**
 * The dashboard mounted as `main.ts` mounts it, against the test archive
 * (archive.global-setup.ts). One per test file: the dashboard keeps its page
 * state in global services, which a second mount in the same window would
 * find already set.
 */
export async function openDashboard(url = '/') {
  CraftTestBed.configureTestingModule({ providers: [...appConfig.providers] });
  const element = document.createElement('div');
  document.body.append(element);
  mountCraftComponent(DebugSessionDashboard, element, CraftTestBed.inject(Injector));
  CraftTestBed.tick();
  /** The elements of a `data-lab` a user can see: not under `hidden`. */
  const visible = (lab: string) =>
    [...element.querySelectorAll<HTMLElement>(`[data-lab="${lab}"]`)].filter(
      (node) => node.closest('[hidden]') === null,
    );
  const shown = (lab: string, text?: string, timeout = 5_000) =>
    vi.waitFor(
      () => {
        const nodes = visible(lab);
        expect(nodes.length, `[data-lab="${lab}"] visible`).toBeGreaterThan(0);
        if (text) expect(nodes.map((node) => node.textContent).join(' ')).toContain(text);
        return nodes;
      },
      { timeout },
    );
  const click = async (lab: string, text?: string) => {
    const [target] = await shown(lab, text);
    target?.click();
    CraftTestBed.tick();
  };
  // The dashboard opens on its list; a link of its own is followed from there.
  await shown('list-page');
  if (url !== '/') {
    const router = ɵrunInInjectionContext(CraftTestBed.inject(Injector), () =>
      ɵinjectCraftRouterRuntime(),
    );
    if (!router) throw new Error('Craft router was not provided');
    await router.navigateByUrl(url);
    CraftTestBed.tick();
  }
  return { element, visible, shown, click };
}

/** The ids the archive holds, as its HTTP API lists them. */
export async function archivedIds(): Promise<string[]> {
  const response = await fetch(`${inject('archiveUrl')}/sessions`);
  const body = (await response.json()) as { sessions: { id: string }[] };
  return body.sessions.map((session) => session.id).sort();
}
