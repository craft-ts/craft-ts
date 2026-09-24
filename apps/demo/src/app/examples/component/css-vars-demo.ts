import {
  a,
  craftComponent,
  div,
  heading,
  headingSection,
  p,
  section,
} from '@craft-ts/component';
import { CraftRouterLink, type CraftRouterLinkInput } from '@craft-ts/core';
import { CssVarsPageNav } from './css-vars-demo.shared';
import { cssVarsDemo } from './css-vars.style';

const CASES = [
  {
    path: 'css-vars/required',
    title: 'Per-instance values',
    description:
      'Every variable has a typed initial value; a variant sets only what it changes.',
  },
  {
    path: 'css-vars/inheritance',
    title: 'Inheritance',
    description:
      'inherits: true — a parent sets the value, descendants read it.',
  },
  {
    path: 'css-vars/forwarding',
    title: 'Forwarding and overrides',
    description: "Turn a child's variables into an optional parent API.",
  },
  {
    path: 'css-vars/property',
    title: '@property',
    description: 'A registered percentage the browser can interpolate.',
  },
] satisfies readonly {
  path: NonNullable<CraftRouterLinkInput['to']>;
  title: string;
  description: string;
}[];

export const CssVarsDemo = craftComponent(
  'CssVarsDemo',
  {},
  () => ({}),
  () =>
    div({ class: cssVarsDemo.page }, [
      CssVarsPageNav(),
      div({ class: cssVarsDemo.intro }, [
        heading('Typed CSS variables'),
        p(
          { class: cssVarsDemo.muted },
          'Variables are declared with cssVars from @craft-ts/style: each one has a kind, a typed initial value, and is registered with @property. A sheet sets them with set(), a template with assign().',
        ),
      ]),
      headingSection(
        section(
          { class: cssVarsDemo.grid, 'aria-label': 'Examples' },
          CASES.map(({ path, title, description }) =>
            a('cardLink', { class: cssVarsDemo.caseCard }, [
              heading(title),
              p({ class: cssVarsDemo.muted }, description),
            ]).pipe(CraftRouterLink({ to: path })),
          ),
        ),
      ),
    ]),
);

export default CssVarsDemo;
