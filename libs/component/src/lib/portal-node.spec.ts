// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  craftComputed,
  craftNodeDirective,
  craftService,
  craftSignal,
  DestroyRef,
  ɵinject as inject,
} from '@craft-ts/core';
import {
  a,
  button,
  craftComponent,
  div,
  hydrateCraft,
  ifNode,
  portalNode,
  provideCraftRootComponent,
  renderCraft,
  span,
} from '../index';
import { renderCraftComponent } from './testing';

afterEach(() => document.body.replaceChildren());

it('escapes a contained pane while retaining its declaring injector, bindings and cleanup (#33)', async () => {
  const text = craftSignal('First');
  const released = vi.fn();
  const { OverlayView, provideOverlayView } = craftService(
    { name: 'OverlayView', providedIn: 'toProvide' },
    function* () {
      yield* craftComputed('text', function* () {
        return text();
      });
    },
  );
  const Content = craftComponent('PortalOwnedContent', {}, function* () {
    const { text } = yield* OverlayView();
    inject(DestroyRef).onDestroy(released);
    return div({ role: 'dialog' }, span(text));
  });
  const Root = craftComponent(
    'PortalOwner',
    { providers: [provideOverlayView()] },
    () => div({ id: 'pane' }, portalNode('body', Content({}))),
  );
  const view = await renderCraftComponent(Root);
  const pane = view.element.querySelector<HTMLElement>('#pane')!;
  pane.style.contain = 'layout paint';
  pane.style.transform = 'translateZ(0)';
  const overlay = document.body.querySelector('[role="dialog"]')!;
  expect(overlay.parentNode).toBe(document.body);
  expect(pane.contains(overlay)).toBe(false);
  expect(overlay.textContent).toBe('First');
  text.set('Second');
  await view.flush();
  expect(overlay.textContent).toBe('Second');
  view.destroy();
  expect(overlay.isConnected).toBe(false);
  expect(released).toHaveBeenCalledOnce();
});

it('moves the existing child view between targets without remounting or losing listeners', async () => {
  const left = document.createElement('section');
  const right = document.createElement('section');
  document.body.append(left, right);
  const target = craftSignal<Element>(left);
  let instances = 0;
  const Content = craftComponent('MovingPortalChild', {}, () => {
    instances++;
    const clicks = craftSignal(0);
    return button(
      'PortalClick',
      { click: () => clicks.update((value) => value + 1) },
      () => String(clicks()),
    );
  });
  const Root = craftComponent('MovingPortalOwner', {}, () =>
    portalNode(() => target(), Content({})),
  );
  const view = await renderCraftComponent(Root);
  const original = left.querySelector('button')!;
  original.click();
  await view.flush();
  expect(original.textContent).toBe('1');
  target.set(right);
  await view.flush();
  expect(right.querySelector('button')).toBe(original);
  expect(left.childNodes).toHaveLength(0);
  expect(instances).toBe(1);
  original.click();
  await view.flush();
  expect(original.textContent).toBe('2');
  view.destroy();
  expect(right.childNodes).toHaveLength(0);
});

it('removes remote content when its conditional node disappears', async () => {
  const open = craftSignal(true);
  const Root = craftComponent('ConditionalPortal', {}, () =>
    div(
      ifNode(
        'open',
        function* () {
          return open();
        },
        () => portalNode('body', div({ role: 'menu' }, 'Menu')),
      ),
    ),
  );
  const view = await renderCraftComponent(Root);
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  open.set(false);
  await view.flush();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  open.set(true);
  await view.flush();
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
  view.destroy();
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it('removes its remote range even when child cleanup fails', async () => {
  const failure = new Error('portal child cleanup');
  const fail = craftNodeDirective('PortalCleanupFailure', [], () => () => {
    throw failure;
  });
  const Root = craftComponent('FailingPortalCleanup', {}, () =>
    div(
      portalNode('body', span({ id: 'remote-cleanup' }, 'Remote').pipe(fail)),
    ),
  );
  const view = await renderCraftComponent(Root);
  expect(() => view.destroy()).toThrow(failure);
  expect(document.querySelector('#remote-cleanup')).toBeNull();
  expect(() => view.destroy()).not.toThrow();
});

it('serializes portal HTML after the app root and hydrates the same remote nodes', async () => {
  const label = craftSignal('Server');
  const Root = craftComponent('SsrPortalOwner', {}, () =>
    div([
      span('Local'),
      portalNode(
        'body',
        div({ role: 'dialog' }, () => label()),
      ),
    ]),
  );
  const config = { providers: [provideCraftRootComponent(Root)] };
  const result = await renderCraft({ config });
  expect(result.rootHtml).not.toContain('role="dialog"');
  expect(result.portalHtml).toContain('role="dialog"');
  expect(result.html.indexOf('role="dialog"')).toBeGreaterThan(
    result.html.indexOf('</craft-root>'),
  );
  document.body.innerHTML = result.html;
  const original = document.querySelector('[role="dialog"]')!;
  const app = hydrateCraft({
    config,
    host: document.querySelector('craft-root')!,
  });
  expect(app.mismatches).toEqual([]);
  expect(document.querySelector('[role="dialog"]')).toBe(original);
  label.set('Client');
  await vi.waitFor(() => expect(original.textContent).toBe('Client'));
  app.destroy();
  expect(original.isConnected).toBe(false);
});

it('discards an unclaimed server portal without touching unrelated document content', async () => {
  const open = craftSignal(true);
  const Root = craftComponent('DiscardedServerPortal', {}, () =>
    ifNode(
      'open',
      function* () {
        return open();
      },
      () => portalNode('body', div({ role: 'menu' }, 'Server menu')),
    ),
  );
  const config = { providers: [provideCraftRootComponent(Root)] };
  const result = await renderCraft({ config });
  document.body.innerHTML = result.html;
  const unrelated = document.createElement('aside');
  unrelated.setAttribute('data-craft-hk', 'other-app/0');
  document.body.append(unrelated);
  open.set(false);
  const app = hydrateCraft({
    config,
    host: document.querySelector('craft-root')!,
  });
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(unrelated.isConnected).toBe(true);
  app.destroy();
});

it('keeps DOM security enforcement inside a portal', async () => {
  const Root = craftComponent('UnsafePortal', {}, () =>
    portalNode('body', a({ href: 'javascript:alert(1)' }, 'Blocked')),
  );
  await expect(renderCraftComponent(Root)).rejects.toThrow(/scheme|URL/);
  expect(document.body.querySelector('a')).toBeNull();
});

it('keeps multiple server portals distinct when hydrating one application', async () => {
  const Root = craftComponent('MultipleSsrPortals', {}, () =>
    div([
      portalNode('body', span({ id: 'portal-first' }, 'First')),
      portalNode('body', span({ id: 'portal-second' }, 'Second')),
    ]),
  );
  const config = { providers: [provideCraftRootComponent(Root)] };
  document.body.innerHTML = (await renderCraft({ config })).html;
  const first = document.querySelector('#portal-first');
  const second = document.querySelector('#portal-second');
  const app = hydrateCraft({
    config,
    host: document.querySelector('craft-root')!,
  });
  expect(app.mismatches).toEqual([]);
  expect(document.querySelector('#portal-first')).toBe(first);
  expect(document.querySelector('#portal-second')).toBe(second);
  app.destroy();
  expect(first?.isConnected).toBe(false);
  expect(second?.isConnected).toBe(false);
});

it('includes remote content in the SSR HTML size budget', async () => {
  const Root = craftComponent('PortalHtmlBudget', {}, () =>
    portalNode('body', div('x'.repeat(2_000))),
  );
  await expect(
    renderCraft({
      config: { providers: [provideCraftRootComponent(Root)] },
      securityPolicy: { ssr: { maxHtmlBytes: 1_000 } },
    }),
  ).rejects.toThrow('CRAFT_SSR_HTML_TOO_LARGE');
});
