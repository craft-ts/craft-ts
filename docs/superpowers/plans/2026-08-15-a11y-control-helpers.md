# Helpers a11y renderless (Foldkit → CraftNG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter des helpers hyperscript qui injectent ARIA, IDs liés et `data-*` d’état, une live region montable vide, des locators `getByRole` / `getByLabel` dans les tests template, et deux opt-in P2 (`lang`/`dir` document, `clickFocus`).

**Architecture:** Pas de widget visuel, pas de `toView` Foldkit, pas de TEA. Les helpers retournent des **objets de props à merger** sur `label()` / `input()` / `button()` existants — même ADN que `heading()`. `data-disabled` / `data-invalid` / `data-open` naissent avec les helpers (P1 convention pliée dans P0). `aria-disabled` à la place de `disabled` est **opt-in** (`keepFocusable`). `fieldErrorNode` fusionne déjà `aria-describedby` avec un hint existant : le `descriptionId` de `fieldControl` doit survivre à ce merge.

**Tech Stack:** TypeScript, hyperscript `@craft-ng/component`, Vitest + jsdom, Angular TestBed / Renderer2, Nx `ng-craft-component` et `ng-craft-core`.

## Global Constraints

- Interdiction : `craftButton` stylé, markup imposé, HtmlBuilder Foldkit, Messages TEA.
- `keepFocusable` défaut `false` : un bouton disabled classique reste `disabled`.
- Props consommateur gagnent sur `class` / `style` / events ; le helper possède `id` / ARIA / `data-*`.
- Bindings réactifs : passer les yieldables **tels quels** dans les props (ne pas les lire dans le helper).
- P2 (`lang`/`dir`, `clickFocus`) : APIs opt-in, aucun i18n, aucun search-dialog de démo.
- Tests : Vitest, `@vitest-environment jsdom`, `import '@angular/compiler'` comme `a11y.spec.ts`.
- Commandes : `npx nx test ng-craft-component --testPathPattern=<file>` et `npx nx test ng-craft-core --testPathPattern=<file>`.

## File map

| File | Responsibility |
|---|---|
| Create `libs/component/src/lib/a11y-control.ts` | `fieldIds`, `fieldControl`, `disclosureControl`, `buttonControl`, `clickFocus` |
| Create `libs/component/src/lib/a11y-control.spec.ts` | Tests DOM des bundles |
| Modify `libs/component/src/lib/a11y.ts` | `liveRegion` : `label` → landmark `region`, children vides OK |
| Modify `libs/component/src/lib/a11y.spec.ts` | Tests live region persistante / landmark |
| Modify `libs/component/src/index.ts` | `export * from './lib/a11y-control'` |
| Modify `libs/component/src/lib/testing.ts` | `getByRole`, `queryByRole`, `getByLabel`, `queryByLabel` |
| Modify `libs/component/src/lib/testing.spec.ts` | Tests locators runtime |
| Modify `libs/core/src/lib/browser-boundaries.ts` | `lang` / `setLang` / `dir` / `setDir` sur `BrowserDocument` |
| Modify `libs/core/src/lib/browser-boundaries.spec.ts` | Tests boundary |
| Modify `apps/docs/guide/components/accessibility.md` | API + exemples + convention `data-*` |
| Modify `apps/docs/reference/index.md` | Ligne tableau des nouveaux symboles |
| Modify `apps/demo/src/app/examples/primitives/forms/login-form.ts` | Adopter `fieldControl` (preuve d’usage) |

`fieldErrorNode` / `CraftFieldDirective` : **ne pas modifier**. Le merge `aria-describedby` existe déjà (`interpreter.ts` conserve `originalAriaDescribedBy`).

---

### Task 1: `fieldIds` + `fieldControl`

**Files:**
- Create: `libs/component/src/lib/a11y-control.ts`
- Create: `libs/component/src/lib/a11y-control.spec.ts`
- Modify: `libs/component/src/index.ts` (ajouter `export * from './lib/a11y-control';` à côté de `export * from './lib/a11y';`)

**Interfaces:**
- Consumes: `ElementProps` n’est pas requis ; objets props plats compatibles hyperscript (`id`, `htmlFor`, `aria-*`, `data-*`).
- Produces:

```ts
export type FieldIds = {
  readonly inputId: string;
  readonly descriptionId: string;
};

export function fieldIds(id: string): FieldIds;

export type FieldControl = {
  readonly ids: FieldIds;
  readonly input: {
    readonly id: string;
    readonly 'aria-describedby': string;
    readonly 'aria-invalid'?: true;
    readonly 'data-invalid'?: true;
  };
  readonly label: { readonly htmlFor: string };
  readonly description: { readonly id: string };
};

export function fieldControl(
  id: string,
  options?: { readonly invalid?: boolean },
): FieldControl;
```

`invalid` est un boolean **statique** dans cette tâche. Un yieldable se branche plus tard en passant `'aria-invalid': field.invalid` à la main sur l’input (le helper ne lit pas de signaux).

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import '@angular/compiler';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  craftComponent,
  fieldControl,
  fieldIds,
  input,
  label,
  mountCraftComponent,
  p,
} from '../index';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

describe('fieldControl', () => {
  it('derives descriptionId from the input id', () => {
    expect(fieldIds('email')).toEqual({
      inputId: 'email',
      descriptionId: 'email-description',
    });
  });

  it('wires label htmlFor, input id, and aria-describedby', () => {
    const email = fieldControl('email');
    const root = craftComponent(
      'fieldControlBasic',
      {},
      () => ({}),
      () => [
        label(email.label, 'Email'),
        input({ ...email.input, type: 'email' }),
        p(email.description, 'We never share your email.'),
      ],
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const control = element.querySelector('input');
    const labelEl = element.querySelector('label');
    const hint = element.querySelector('#email-description');
    expect(control?.id).toBe('email');
    expect(labelEl?.htmlFor).toBe('email');
    expect(control?.getAttribute('aria-describedby')).toBe('email-description');
    expect(hint?.textContent).toBe('We never share your email.');
  });

  it('sets aria-invalid and data-invalid when invalid is true', () => {
    const email = fieldControl('email', { invalid: true });
    const root = craftComponent(
      'fieldControlInvalid',
      {},
      () => ({}),
      () => input({ ...email.input, type: 'email' }),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const control = element.querySelector('input');
    expect(control?.getAttribute('aria-invalid')).toBe('true');
    expect(control?.hasAttribute('data-invalid')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test ng-craft-component --testPathPattern=a11y-control.spec`

Expected: FAIL — `fieldControl` / `fieldIds` are not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// libs/component/src/lib/a11y-control.ts
export type FieldIds = {
  readonly inputId: string;
  readonly descriptionId: string;
};

export function fieldIds(id: string): FieldIds {
  return {
    inputId: id,
    descriptionId: `${id}-description`,
  };
}

export type FieldControl = {
  readonly ids: FieldIds;
  readonly input: {
    readonly id: string;
    readonly 'aria-describedby': string;
    readonly 'aria-invalid'?: true;
    readonly 'data-invalid'?: true;
  };
  readonly label: { readonly htmlFor: string };
  readonly description: { readonly id: string };
};

export function fieldControl(
  id: string,
  options?: { readonly invalid?: boolean },
): FieldControl {
  const ids = fieldIds(id);
  return {
    ids,
    input: {
      id: ids.inputId,
      'aria-describedby': ids.descriptionId,
      ...(options?.invalid
        ? { 'aria-invalid': true as const, 'data-invalid': true as const }
        : {}),
    },
    label: { htmlFor: ids.inputId },
    description: { id: ids.descriptionId },
  };
}
```

Ajouter `export * from './lib/a11y-control';` dans `libs/component/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test ng-craft-component --testPathPattern=a11y-control.spec`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/component/src/lib/a11y-control.ts libs/component/src/lib/a11y-control.spec.ts libs/component/src/index.ts
git commit -m "$(cat <<'EOF'
feat(component): add fieldControl a11y prop bundles

Give forms a single id graph for label, input, and description so
aria-describedby cannot drift from htmlFor.
EOF
)"
```

---

### Task 2: `disclosureControl`

**Files:**
- Modify: `libs/component/src/lib/a11y-control.ts`
- Modify: `libs/component/src/lib/a11y-control.spec.ts`

**Interfaces:**
- Consumes: `fieldIds` pattern (`${id}-button`, `${id}-panel`).
- Produces:

```ts
export type DisclosureControl = {
  readonly buttonId: string;
  readonly panelId: string;
  readonly button: {
    readonly type: 'button';
    readonly id: string;
    readonly 'aria-expanded': boolean;
    readonly 'aria-controls': string;
    readonly 'data-open'?: true;
    readonly 'aria-disabled'?: true;
    readonly 'data-disabled'?: true;
  };
  readonly panel: {
    readonly id: string;
    readonly 'data-open'?: true;
    readonly 'aria-hidden'?: true;
  };
};

export function disclosureControl(
  id: string,
  isOpen: boolean,
  options?: { readonly disabled?: boolean },
): DisclosureControl;
```

Le toggle est un **`<button type="button">` natif** : Entrée / Espace restent au navigateur. Pas de handlers clavier maison.

- [ ] **Step 1: Write the failing test**

Ajouter dans `a11y-control.spec.ts` :

```ts
import { button, disclosureControl, div } from '../index';

describe('disclosureControl', () => {
  it('links aria-expanded and aria-controls to the panel id', () => {
    const faq = disclosureControl('faq-1', true);
    const root = craftComponent(
      'disclosureOpen',
      {},
      () => ({}),
      () => [
        button(faq.button, 'What is Craft?'),
        div(faq.panel, 'A typed Angular framework.'),
      ],
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const toggle = element.querySelector('button');
    const panel = element.querySelector('#faq-1-panel');
    expect(toggle?.id).toBe('faq-1-button');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-controls')).toBe('faq-1-panel');
    expect(toggle?.hasAttribute('data-open')).toBe(true);
    expect(panel?.hasAttribute('data-open')).toBe(true);
    expect(panel?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('hides the panel and drops data-open when closed', () => {
    const faq = disclosureControl('faq-1', false);
    const root = craftComponent(
      'disclosureClosed',
      {},
      () => ({}),
      () => [button(faq.button, 'Q'), div(faq.panel, 'A')],
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const toggle = element.querySelector('button');
    const panel = element.querySelector('#faq-1-panel');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.hasAttribute('data-open')).toBe(false);
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the toggle aria-disabled when disabled', () => {
    const faq = disclosureControl('faq-1', false, { disabled: true });
    expect(faq.button['aria-disabled']).toBe(true);
    expect(faq.button['data-disabled']).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test ng-craft-component --testPathPattern=a11y-control.spec`

Expected: FAIL — `disclosureControl` is not exported.

- [ ] **Step 3: Write minimal implementation**

Ajouter dans `a11y-control.ts` :

```ts
export type DisclosureControl = {
  readonly buttonId: string;
  readonly panelId: string;
  readonly button: {
    readonly type: 'button';
    readonly id: string;
    readonly 'aria-expanded': boolean;
    readonly 'aria-controls': string;
    readonly 'data-open'?: true;
    readonly 'aria-disabled'?: true;
    readonly 'data-disabled'?: true;
  };
  readonly panel: {
    readonly id: string;
    readonly 'data-open'?: true;
    readonly 'aria-hidden'?: true;
  };
};

export function disclosureControl(
  id: string,
  isOpen: boolean,
  options?: { readonly disabled?: boolean },
): DisclosureControl {
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;
  const openAttrs = isOpen ? ({ 'data-open': true as const } as const) : {};
  return {
    buttonId,
    panelId,
    button: {
      type: 'button',
      id: buttonId,
      'aria-expanded': isOpen,
      'aria-controls': panelId,
      ...openAttrs,
      ...(options?.disabled
        ? { 'aria-disabled': true as const, 'data-disabled': true as const }
        : {}),
    },
    panel: {
      id: panelId,
      ...openAttrs,
      ...(isOpen ? {} : { 'aria-hidden': true as const }),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test ng-craft-component --testPathPattern=a11y-control.spec`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/component/src/lib/a11y-control.ts libs/component/src/lib/a11y-control.spec.ts
git commit -m "$(cat <<'EOF'
feat(component): add disclosureControl ARIA linking

Derive button/panel ids and aria-expanded/aria-controls so FAQs do not
hand-roll the disclosure graph.
EOF
)"
```

---

### Task 3: `buttonControl` (`keepFocusable` opt-in)

**Files:**
- Modify: `libs/component/src/lib/a11y-control.ts`
- Modify: `libs/component/src/lib/a11y-control.spec.ts`

**Interfaces:**
- Consumes: hyperscript `button()`.
- Produces:

```ts
export type ButtonControl = {
  readonly type: 'button' | 'submit' | 'reset';
  readonly disabled?: true;
  readonly 'aria-disabled'?: true;
  readonly 'data-disabled'?: true;
};

export function buttonControl(options?: {
  readonly type?: 'button' | 'submit' | 'reset';
  readonly disabled?: boolean;
  readonly keepFocusable?: boolean;
}): ButtonControl;
```

Règle : `disabled && keepFocusable` → `aria-disabled` + `data-disabled`, **pas** `disabled`. `disabled && !keepFocusable` → `disabled` + `data-disabled`. Défaut `type: 'button'` (aligne le lint `button-has-type`).

- [ ] **Step 1: Write the failing test**

```ts
import { button, buttonControl } from '../index';

describe('buttonControl', () => {
  it('defaults type to button', () => {
    const root = craftComponent(
      'buttonControlType',
      {},
      () => ({}),
      () => button(buttonControl(), 'Save'),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    expect(element.querySelector('button')?.getAttribute('type')).toBe('button');
  });

  it('uses native disabled by default', () => {
    const root = craftComponent(
      'buttonControlDisabled',
      {},
      () => ({}),
      () => button(buttonControl({ disabled: true }), 'Save'),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const el = element.querySelector('button');
    expect(el?.disabled).toBe(true);
    expect(el?.hasAttribute('data-disabled')).toBe(true);
    expect(el?.getAttribute('aria-disabled')).toBeNull();
  });

  it('keeps the button focusable when keepFocusable is set', () => {
    const root = craftComponent(
      'buttonControlKeepFocusable',
      {},
      () => ({}),
      () =>
        button(buttonControl({ disabled: true, keepFocusable: true }), 'Save'),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const el = element.querySelector('button') as HTMLButtonElement;
    expect(el.disabled).toBe(false);
    expect(el.getAttribute('aria-disabled')).toBe('true');
    expect(el.hasAttribute('data-disabled')).toBe(true);
    el.focus();
    expect(document.activeElement).toBe(el);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test ng-craft-component --testPathPattern=a11y-control.spec`

Expected: FAIL — `buttonControl` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
export type ButtonControl = {
  readonly type: 'button' | 'submit' | 'reset';
  readonly disabled?: true;
  readonly 'aria-disabled'?: true;
  readonly 'data-disabled'?: true;
};

export function buttonControl(options?: {
  readonly type?: 'button' | 'submit' | 'reset';
  readonly disabled?: boolean;
  readonly keepFocusable?: boolean;
}): ButtonControl {
  const type = options?.type ?? 'button';
  if (!options?.disabled) {
    return { type };
  }
  if (options.keepFocusable) {
    return {
      type,
      'aria-disabled': true,
      'data-disabled': true,
    };
  }
  return {
    type,
    disabled: true,
    'data-disabled': true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test ng-craft-component --testPathPattern=a11y-control.spec`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/component/src/lib/a11y-control.ts libs/component/src/lib/a11y-control.spec.ts
git commit -m "$(cat <<'EOF'
feat(component): add buttonControl with opt-in keepFocusable

Default to native disabled; aria-disabled only when the author asks to
keep the control in the tab order.
EOF
)"
```

---

### Task 4: `liveRegion` persistante + landmark optionnel

**Files:**
- Modify: `libs/component/src/lib/a11y.ts` (`liveRegion` props)
- Modify: `libs/component/src/lib/a11y.spec.ts`

**Interfaces:**
- Consumes: `span()` hyperscript, overload actuel `politeness`.
- Produces: même `liveRegion`, props étendues :

```ts
{
  readonly politeness?: 'polite' | 'assertive';
  readonly label?: string;
}
```

Quand `label` est fourni : `role="region"`, `aria-label={label}`, `aria-live` selon `politeness` (défaut `polite`), `aria-atomic="true"`. Sans `label` : comportement actuel (`status` / `alert`). Children vides : le nœud **reste** dans le DOM.

- [ ] **Step 1: Write the failing test**

Ajouter dans `a11y.spec.ts` :

```ts
describe('liveRegion persistence', () => {
  it('stays mounted when the announced text is empty', () => {
    const root = craftComponent(
      'liveRegionEmpty',
      {},
      () => ({}),
      () => liveRegion({ label: 'Notifications' }, ''),
    );
    const element = host();
    mountCraftComponent(root, element, TestBed.inject(Injector));
    TestBed.tick();
    const region = element.querySelector('[aria-live]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('role')).toBe('region');
    expect(region?.getAttribute('aria-label')).toBe('Notifications');
    expect(region?.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test ng-craft-component --testPathPattern=a11y.spec`

Expected: FAIL — `role` is `status`, no `aria-label`.

- [ ] **Step 3: Write minimal implementation**

Dans `a11y.ts`, étendre le type de props et le `span(...)` :

```ts
type LiveRegionProps = {
  readonly politeness?: 'polite' | 'assertive';
  readonly label?: string;
};

// inside liveRegion implementation, after resolving props/children:
const politeness = props.politeness ?? 'polite';
const label = props.label;
return span(
  {
    'aria-live': politeness,
    'aria-atomic': 'true',
    ...(label
      ? { role: 'region' as const, 'aria-label': label }
      : { role: politeness === 'assertive' ? 'alert' : 'status' }),
  },
  children,
);
```

Mettre à jour les overloads TypeScript pour accepter `label` sur le 1er argument objet.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test ng-craft-component --testPathPattern=a11y.spec`

Expected: PASS (y compris le test `polite status` existant).

- [ ] **Step 5: Commit**

```bash
git add libs/component/src/lib/a11y.ts libs/component/src/lib/a11y.spec.ts
git commit -m "$(cat <<'EOF'
feat(component): keep liveRegion mounted as an optional landmark

An empty labelled region stays in the tree so screen readers subscribe
before the first toast.
EOF
)"
```

---

### Task 5: `getByRole` / `getByLabel` sur les tests template

**Files:**
- Modify: `libs/component/src/lib/testing.ts` (`TemplateTestResult` + helpers runtime)
- Modify: `libs/component/src/lib/testing.spec.ts`

**Interfaces:**
- Consumes: `setupCraftComponentTemplateTest` → `nativeElement: HTMLDivElement`. Locators type-level `locator(tag, criteria)` **inchangés**.
- Produces: mêmes helpers sur le résultat de `setupCraftComponentTemplateTest` **et** `setupCraftDirectiveTemplateTest` :

```ts
getByRole(role: string, options?: { name?: string | RegExp }): HTMLElement;
queryByRole(role: string, options?: { name?: string | RegExp }): HTMLElement | undefined;
getByLabel(name: string | RegExp): HTMLElement;
queryByLabel(name: string | RegExp): HTMLElement | undefined;
```

`getBy*` throw si 0 match (`Unable to find role "…" with name "…"`) ou si >1 (`Found 2 elements with role "…"`). `queryBy*` → `undefined` si 0, throw si >1.

Rôle implicite minimum : `button`, `link` (`a[href]`), `textbox` (`input` sauf checkbox/radio/submit/button, `textarea`), `checkbox`, `radio`, `img`, `navigation`, `main`, `heading`, plus `role` explicite.

Nom accessible, dans l’ordre : `aria-labelledby` (ids dans le container), `aria-label`, `label[for=id]`, `textContent`.

- [ ] **Step 1: Write the failing test**

Ajouter dans `testing.spec.ts`, en réutilisant le `beforeAll` / `beforeEach` existants :

```ts
it('finds controls by role and accessible name', async () => {
  const Page = craftComponent(
    'roleLocatorPage',
    {},
    () => ({}),
    () => [
      label({ htmlFor: 'email' }, 'Email'),
      input({ id: 'email', type: 'email' }),
      button({ type: 'button' }, 'Save'),
    ],
  );
  const result = await setupCraftComponentTemplateTest(Page, {
    context: {},
    register: {},
  });
  expect(result.getByRole('button', { name: 'Save' }).textContent).toBe('Save');
  expect(result.getByLabel('Email').id).toBe('email');
  expect(result.queryByRole('button', { name: 'Missing' })).toBeUndefined();
  expect(() => result.getByRole('button', { name: 'Missing' })).toThrow(
    /Unable to find/,
  );
  result.destroy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test ng-craft-component --testPathPattern=testing.spec`

Expected: FAIL — `getByRole` is not a function.

- [ ] **Step 3: Write minimal implementation**

Dans `testing.ts`, au-dessus de `setupCraftComponentTemplateTestImpl` :

```ts
function matchesName(actual: string, expected: string | RegExp | undefined): boolean {
  if (expected === undefined) return true;
  return typeof expected === 'string'
    ? actual === expected
    : expected.test(actual);
}

function accessibleName(element: Element, root: ParentNode): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => root.querySelector(`#${CSS.escape(id)}`)?.textContent ?? '')
      .join(' ')
      .trim();
  }
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    if (element.id) {
      const label = root.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return (label.textContent ?? '').trim();
    }
  }
  return (element.textContent ?? '').trim();
}

function implicitRole(element: Element): string | null {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    const type = (element as HTMLInputElement).type;
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
    return 'textbox';
  }
  if (tag === 'img') return 'img';
  if (tag === 'nav') return 'navigation';
  if (tag === 'main') return 'main';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  return null;
}

function queryAllByRole(
  root: Element,
  role: string,
  options?: { name?: string | RegExp },
): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('*')].filter((node) => {
    if (implicitRole(node) !== role) return false;
    return matchesName(accessibleName(node, root), options?.name);
  });
}

function requireSingle(
  elements: HTMLElement[],
  query: string,
  allowEmpty: boolean,
): HTMLElement | undefined {
  if (elements.length > 1) {
    throw new Error(`Found ${elements.length} elements with ${query}`);
  }
  if (elements.length === 0) {
    if (allowEmpty) return undefined;
    throw new Error(`Unable to find ${query}`);
  }
  return elements[0];
}

function createAccessibleQueries(root: HTMLElement) {
  return {
    getByRole(role: string, options?: { name?: string | RegExp }) {
      return requireSingle(
        queryAllByRole(root, role, options),
        `role "${role}"`,
        false,
      )!;
    },
    queryByRole(role: string, options?: { name?: string | RegExp }) {
      return requireSingle(
        queryAllByRole(root, role, options),
        `role "${role}"`,
        true,
      );
    },
    getByLabel(name: string | RegExp) {
      const labelled = [...root.querySelectorAll<HTMLElement>('input, textarea, select, button')].filter(
        (node) => matchesName(accessibleName(node, root), name),
      );
      return requireSingle(labelled, `label "${String(name)}"`, false)!;
    },
    queryByLabel(name: string | RegExp) {
      const labelled = [...root.querySelectorAll<HTMLElement>('input, textarea, select, button')].filter(
        (node) => matchesName(accessibleName(node, root), name),
      );
      return requireSingle(labelled, `label "${String(name)}"`, true);
    },
  };
}
```

Étendre `TemplateTestResult` avec les 4 méthodes. Spreader `...createAccessibleQueries(host)` dans les `return` de `setupCraftComponentTemplateTestImpl` **et** `setupCraftDirectiveTemplateTestImpl`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test ng-craft-component --testPathPattern=testing.spec`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/component/src/lib/testing.ts libs/component/src/lib/testing.spec.ts
git commit -m "$(cat <<'EOF'
feat(component): add getByRole and getByLabel template queries

Fail tests when the accessible name disappears, without replacing
compile-time locators.
EOF
)"
```

---

### Task 6: `BrowserDocument` lang / dir (P2 opt-in)

**Files:**
- Modify: `libs/core/src/lib/browser-boundaries.ts` (`BrowserDocumentServiceApi`, factory, `BrowserDocument` DSL)
- Modify: `libs/core/src/lib/browser-boundaries.spec.ts`

**Interfaces:**
- Consumes: `getBrowserDocument()` déjà utilisé par `setTitle`.
- Produces:

```ts
// on BrowserDocumentServiceApi
lang(): string;
setLang(value: string): void;
dir(): 'ltr' | 'rtl' | 'auto' | '';
setDir(value: 'ltr' | 'rtl' | 'auto' | ''): void;
```

Même surface sur `BrowserDocument` (yieldables `lang`, `setLang`, `dir`, `setDir`). `setLang` écrit `document.documentElement.lang`. `setDir('')` **remove** l’attribut `dir`. Pas de feature router : l’app appelle ça depuis un `craftEffect` quand la locale change.

- [ ] **Step 1: Write the failing test**

Dans `browser-boundaries.spec.ts`, dans le describe existant qui mock `BrowserDocument`, ajouter un cas **unmocked** jsdom (le fichier a déjà un environnement navigateur) :

```ts
it('reads and writes documentElement lang and dir', async () => {
  const { run } = /* same helper the file already uses to run a generator against real boundaries */;
  document.documentElement.lang = 'en';
  document.documentElement.removeAttribute('dir');
  await run(function* () {
    expect(yield* BrowserDocument.lang()).toBe('en');
    yield* BrowserDocument.setLang('fr');
    yield* BrowserDocument.setDir('rtl');
    expect(yield* BrowserDocument.lang()).toBe('fr');
    expect(yield* BrowserDocument.dir()).toBe('rtl');
    yield* BrowserDocument.setDir('');
  });
  expect(document.documentElement.lang).toBe('fr');
  expect(document.documentElement.hasAttribute('dir')).toBe(false);
});
```

Adapter `run` au helper déjà présent dans `browser-boundaries.spec.ts` (le fichier exécute déjà `yield* BrowserDocument.setTitle('Checkout')`). Recopier **exactement** ce harness ; ne pas en inventer un second.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test ng-craft-core --testPathPattern=browser-boundaries.spec`

Expected: FAIL — `BrowserDocument.setLang` is not a function.

- [ ] **Step 3: Write minimal implementation**

1. Étendre `BrowserDocumentServiceApi` avec les 4 méthodes.
2. Dans la factory `craftService` de `browserDocumentService` :

```ts
lang: () => getBrowserDocument().documentElement.lang,
setLang: (value: string) => {
  getBrowserDocument().documentElement.lang = value;
},
dir: () =>
  (getBrowserDocument().documentElement.getAttribute('dir') ?? '') as
    | 'ltr'
    | 'rtl'
    | 'auto'
    | '',
setDir: (value: 'ltr' | 'rtl' | 'auto' | '') => {
  const el = getBrowserDocument().documentElement;
  if (value) el.setAttribute('dir', value);
  else el.removeAttribute('dir');
},
```

3. Étendre `BrowserDocument` DSL :

```ts
lang: callBrowserDocument('lang'),
setLang: callBrowserDocument('setLang'),
dir: callBrowserDocument('dir'),
setDir: callBrowserDocument('setDir'),
```

Si le spec mocke l’objet service champ par champ, ajouter les 4 clés au mock pour que les tests existants compilent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test ng-craft-core --testPathPattern=browser-boundaries.spec`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/core/src/lib/browser-boundaries.ts libs/core/src/lib/browser-boundaries.spec.ts
git commit -m "$(cat <<'EOF'
feat(core): sync document lang and dir through BrowserDocument

Let a locale switcher update html lang/dir without touching the DOM
outside the browser boundary.
EOF
)"
```

---

### Task 7: `clickFocus` (P2 opt-in)

**Files:**
- Modify: `libs/component/src/lib/a11y-control.ts`
- Modify: `libs/component/src/lib/a11y-control.spec.ts`

**Interfaces:**
- Consumes: `ElementEventHandler` de `hyperscript.ts` (`(event: MouseEvent) => unknown`).
- Produces:

```ts
export function clickFocus<E extends MouseEvent>(
  selector: string,
  handler?: (event: E) => unknown,
): (event: E) => unknown;
```

Dans le handler : `event.currentTarget.ownerDocument.querySelector(selector)` puis `.focus()` **avant** `handler?.(event)`. Si aucun nœud : no-op sur le focus, le handler tourne quand même. Pas de `preventDefault`.

- [ ] **Step 1: Write the failing test**

```ts
import { clickFocus } from '../index';

describe('clickFocus', () => {
  it('focuses the matching element inside the click gesture', () => {
    const calls: string[] = [];
    const warmup = document.createElement('input');
    warmup.id = 'search-warmup';
    document.body.append(warmup);
    const handler = clickFocus('#search-warmup', () => {
      calls.push('opened');
    });
    const buttonEl = document.createElement('button');
    document.body.append(buttonEl);
    handler({ currentTarget: buttonEl } as unknown as MouseEvent);
    expect(document.activeElement).toBe(warmup);
    expect(calls).toEqual(['opened']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test ng-craft-component --testPathPattern=a11y-control.spec`

Expected: FAIL — `clickFocus` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
export function clickFocus<E extends MouseEvent>(
  selector: string,
  handler?: (event: E) => unknown,
): (event: E) => unknown {
  return (event: E) => {
    const root = (event.currentTarget as Element | null)?.ownerDocument ?? document;
    const target = root.querySelector<HTMLElement>(selector);
    target?.focus();
    return handler?.(event);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test ng-craft-component --testPathPattern=a11y-control.spec`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/component/src/lib/a11y-control.ts libs/component/src/lib/a11y-control.spec.ts
git commit -m "$(cat <<'EOF'
feat(component): add clickFocus for gesture-sync focusing

Focus a warmup input inside the click handler so iOS can open the
keyboard before a dialog mounts.
EOF
)"
```

---

### Task 8: Docs + démo login-form

**Files:**
- Modify: `apps/docs/guide/components/accessibility.md`
- Modify: `apps/docs/reference/index.md` (ligne tableau Routing / Accessibility)
- Modify: `apps/demo/src/app/examples/primitives/forms/login-form.ts`

**Interfaces:**
- Consumes: APIs des tasks 1–7.
- Produces: doc utilisateur + un exemple réel.

- [ ] **Step 1: Update accessibility.md**

Remplacer le paragraphe « Pas de `craftButton` » par : pas de bouton **stylé** ; `buttonControl` / `fieldControl` / `disclosureControl` injectent des props.

Ajouter une section **Helpers de contrôle (props à merger)** avec :

```ts
const email = fieldControl('email');
label(email.label, 'Email');
input({ ...email.input, type: 'email' });
p(email.description, 'We never share your email.');

const faq = disclosureControl('faq-1', isOpen);
button({ ...faq.button, click: toggle }, 'What is Craft?');
div(faq.panel, '…');

button(buttonControl({ disabled: isSaving, keepFocusable: true }), 'Save');
```

Convention CSS :

```css
button[data-disabled] { opacity: 0.5; }
input[data-invalid] { border-color: var(--danger); }
button[data-open] { font-weight: 600; }
```

Live region : **ne jamais** gater le nœud sur le message.

```ts
// correct — region exists at first paint
liveRegion({ label: 'Notifications' }, copied() ? 'Copied' : '');

// incorrect — SR never subscribes
ifNode(copied, () => liveRegion('Copied'));
```

`getByRole` / `getByLabel` dans la section Tests, à côté de `toBeAccessible()`.

P2 :

```ts
yield* BrowserDocument.setLang('fr');
yield* BrowserDocument.setDir('ltr');

button({
  type: 'button',
  click: clickFocus('#search-warmup', openSearch),
}, 'Search');
```

- [ ] **Step 2: Update reference table**

Dans `apps/docs/reference/index.md`, remplacer la ligne `heading… liveRegion` par une ligne qui liste aussi `fieldControl`, `disclosureControl`, `buttonControl`, `clickFocus`, et ajouter `BrowserDocument.setLang` / `setDir` dans la section HTTP and boundaries (là où `BrowserDocument` est déjà documenté). Si `BrowserDocument` n’a pas encore de ligne, l’ajouter à côté des autres boundaries.

- [ ] **Step 3: Adopt `fieldControl` in the login demo**

Dans `login-form.ts`, remplacer les `id` / `htmlFor` manuels :

```ts
const email = fieldControl('email');
const password = fieldControl('password');
// …
label(email.label, 'Email'),
input({ ...email.input, type: 'email' }).pipe(CraftFieldDirective(loginForm.form.selectEmail())),
```

Idem password. Ne pas retirer `fieldErrorNode` : le merge `aria-describedby` doit continuer à fonctionner (le hint d’erreur s’ajoute à `email-description` si un `p(email.description)` est rendu ; s’il n’y a pas de hint statique, ne pas rendre `description` vide — omettre le `p` si pas de texte).

- [ ] **Step 4: Run targeted tests + demo typecheck**

Run:

```
npx nx test ng-craft-component --testPathPattern=a11y-control.spec
npx nx test ng-craft-component --testPathPattern=a11y.spec
npx nx test ng-craft-component --testPathPattern=testing.spec
npx nx test ng-craft-core --testPathPattern=browser-boundaries.spec
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/docs/guide/components/accessibility.md apps/docs/reference/index.md apps/demo/src/app/examples/primitives/forms/login-form.ts
git commit -m "$(cat <<'EOF'
docs(a11y): document renderless control helpers and persistent live regions

Show fieldControl in the login demo so the id graph is the default
authoring path.
EOF
)"
```

---

## Self-review

**Spec coverage**

| Livrable demandé | Task |
|---|---|
| P0 Helpers ID + bundles Input / Disclosure | Task 1, Task 2 (`buttonControl` Task 3 complète le trio sans widget visuel) |
| P0 liveRegion racine toujours montée | Task 4 |
| P1 `data-disabled` / `data-invalid` / `data-open` | Inclus dans Tasks 1–3 + CSS Task 8 |
| P1 `getByRole` / `getByLabel` | Task 5 |
| P2 Document lang/dir | Task 6 |
| P2 OnClickFocus / search-dialog mobile | Task 7 (`clickFocus`) |

**Hors scope volontaire :** kit clavier roving tabindex, `@craft-ng/ui`, toasts animés, i18n catalog, ESLint `require-persistent-live-region`.

**Type consistency:** `fieldControl` / `disclosureControl` / `buttonControl` / `clickFocus` vivent dans `a11y-control.ts` et sortent via `index.ts`. `BrowserDocument.setLang` / `setDir` matchent `BrowserDocumentServiceApi`.
