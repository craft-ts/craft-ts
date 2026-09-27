import {
  a,
  craftComponent,
  CraftRouterOutlet,
  div,
  main,
  nav,
} from '@craft-ts/component';
import { craftService, CraftRouterLink } from '@craft-ts/core';
import { demoNav } from './demo.style';

export const { AppShellView, provideAppShellView } = craftService(
  { name: 'appShellView', providedIn: 'toProvide' },
  function* () {
    return {};
  },
);

const AppShell = craftComponent(
  'AppShell',
  {
    providers: [provideAppShellView()],
  },
  function* () {
    yield* AppShellView();
    return div({ class: demoNav.root }, [
      nav({ class: demoNav.bar }, [
        a(
          'navLinkPublicProducts',
          { class: demoNav.link },
          'Public products',
        ).pipe(CraftRouterLink({ to: '' })),
        a(
          'navLinkAuthenticatedList',
          { class: demoNav.link },
          'Authenticated list',
        ).pipe(CraftRouterLink({ to: 'authenticated-list' })),
        a('navLinkSimpleUsers', { class: demoNav.link }, 'Simple users').pipe(
          CraftRouterLink({ to: 'simple-list' }),
        ),
        a(
          'navLinkPortable',
          { class: demoNav.link },
          'Portable middleware',
        ).pipe(CraftRouterLink({ to: 'portable' })),
        a(
          'navLinkEffectMiddleware',
          { class: demoNav.link },
          'Effect middleware',
        ).pipe(CraftRouterLink({ to: 'effect-middleware' })),
      ]),
      main(CraftRouterOutlet()),
    ]);
  },
);

export { AppShell };
