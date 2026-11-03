import { mountCraftComponent } from '@craft-ts/component';
import {
  CraftTestBed,
  craftUse,
  provideCraftRouter,
  provideCraftSchemaValidationPolicy,
  withHashLocation,
  ɵInjector as Injector,
} from '@craft-ts/core';
import { expect, inject, vi } from 'vitest';
import { ReviewApp } from '../src/review-app';
import { provideReviewAppModel, ReviewAppModel } from '../src/review-app.model';
import { provideReviewNavigation } from '../src/review-navigation.service';
import { reviewRoutes } from '../src/review.routes';
import type { ReviewScenario } from './review-scenarios';

/**
 * The review app as `main.ts` mounts it, talking to its scenario's review
 * server (review-servers.global-setup.ts): the page asks `/api/…` of its own
 * origin, which is that server's once served.
 */
export function mountReviewApp(scenario: ReviewScenario) {
  const server = inject('reviewServers')[scenario];
  const fetchFromPage = globalThis.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const served = url.startsWith('/')
      ? `${server}${url}`
      : url.replace(window.location.origin, server);
    const answer = fetchFromPage(input instanceof Request ? new Request(served, input) : served, init);
    if (process.env['REVIEW_APP_TRACE'])
      void answer.then(async (response) =>
        console.log('FETCH', init?.method ?? 'GET', served.replace(server, ''), init?.body ? String(init.body).slice(0, 300) : '', response.status, (await response.clone().text()).slice(0, 200)),
      );
    return answer;
  });
  window.history.replaceState(null, '', '/');
  CraftTestBed.configureTestingModule({
    providers: [
      provideCraftSchemaValidationPolicy(() => ({ action: 'reject' })),
      ...provideCraftRouter(reviewRoutes.toRoutes(), withHashLocation()),
      provideReviewAppModel(),
      provideReviewNavigation(),
    ],
  });
  const element = document.createElement('div');
  document.body.append(element);
  mountCraftComponent(ReviewApp, element, CraftTestBed.inject(Injector));
  CraftTestBed.tick();
  const model = CraftTestBed.runInInjectionContext(() => craftUse(ReviewAppModel()));

  const text = () => (element.textContent ?? '').replace(/\s+/g, ' ');
  /** What a reviewer can read: the text outside `hidden`. */
  const visibleText = () => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[hidden]').forEach((node) => node.remove());
    return (copy.textContent ?? '').replace(/\s+/g, ' ');
  };
  const shows = (expected: string, timeout = 5_000) =>
    vi.waitFor(() => expect(text()).toContain(expected), { timeout });
  /** The control a reviewer sees under that name, once it is there and enabled. */
  const control = <T extends HTMLElement = HTMLElement>(name: string, nth = 0) =>
    vi.waitFor(
      () => {
        const found = [...element.querySelectorAll<T>(`[data-craft-name="${name}"]`)].filter(
          (node) => node.closest('[hidden]') === null && !(node as { disabled?: boolean }).disabled,
        )[nth];
        expect(found, `${name} is shown and enabled`).toBeDefined();
        return found!;
      },
      { timeout: 5_000 },
    );
  const click = async (name: string, nth = 0) => {
    (await control(name, nth)).click();
    CraftTestBed.tick();
  };
  const choose = async (name: string, value: string) => {
    const field = await control<HTMLSelectElement | HTMLInputElement>(name);
    field.value = value;
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    CraftTestBed.tick();
  };
  /** Writes the reason, as typed in the note field. */
  const writeNote = async (value: string) => {
    const field = await control('ReviewNote');
    field.textContent = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    CraftTestBed.tick();
  };
  /** The queue as the review server holds it now. */
  const queue = async () =>
    (await (await fetchFromPage(`${server}/api/review`)).json()) as {
      cards: { id: string; state: string; previousDecision?: { verdict: string; note?: string } }[];
      history: { card: { id: string }; decision: { verdict: string; note?: string; retirementReason?: string } }[];
      folderLayoutApply?: { applied?: boolean; command: string };
    };
  /** The first control of that name whose text says so. */
  const clickLabelled = async (name: string, label: string) => {
    const target = await vi.waitFor(() => {
      const found = [...element.querySelectorAll<HTMLElement>(`[data-craft-name="${name}"]`)].find(
        (node) => node.closest('[hidden]') === null && node.textContent?.includes(label),
      );
      expect(found, `${name} "${label}"`).toBeDefined();
      return found!;
    });
    target.click();
    CraftTestBed.tick();
  };
  return { element, model, text, visibleText, shows, control, click, clickLabelled, choose, writeNote, queue, server };
}
