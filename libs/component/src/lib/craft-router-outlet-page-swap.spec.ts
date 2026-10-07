// @vitest-environment jsdom
import {
  provideCraftRouter,
  ɵinjectCraftRouterRuntime,
} from '@craft-ts/core';
import { runInInjectionContext } from './host-runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { craftComponent } from './component';
import { CraftRouterOutlet } from './craft-router-outlet';
import { p } from './hyperscript';
import type { Input } from './types';
import { renderCraftComponent } from './testing';

describe('the router outlet swapping one page for another', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('draws the next page once and never builds the page being left again', async () => {
    const drawn: string[] = [];
    const page = (name: string) =>
      craftComponent(name, {}, function* (props: { id: Input<string> }) {
        console.log('PROPS', name, window.location.pathname, JSON.stringify(Reflect.ownKeys(props).map(String)), typeof (props as any).id);
        const id = (props as unknown as { id?: () => string }).id?.() ?? 'none';
        drawn.push(`${name}:${id}`);
        return p(`${name} ${id}`);
      });
    const PageA = page('PageA');
    const PageB = page('PageB');

    const rendered = await renderCraftComponent(CraftRouterOutlet as never, {
      providers: provideCraftRouter([
        { path: 'a/:id', component: PageA as never },
        { path: 'b/:id', component: PageB as never },
      ]) as never,
    });
    const router = runInInjectionContext(rendered.injector, () =>
      ɵinjectCraftRouterRuntime()!,
    );
    await router.navigateByUrl('/a/1');
    await rendered.flush();
    expect(rendered.element.textContent).toBe('PageA 1');
    drawn.length = 0;

    await router.navigateByUrl('/b/2');
    await rendered.flush();

    // The page being left is not drawn again with the next page's inputs, nor torn
    // down and built again under the next page's injector on its way out.
    expect(drawn).toEqual(['PageB:2']);
    expect(rendered.element.textContent).toBe('PageB 2');
    rendered.destroy();
  });
});
