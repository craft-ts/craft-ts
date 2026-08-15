import {
  createEnvironmentInjector,
  ElementRef,
  EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CRAFT_SERVICE_PROVIDER_BRAND,
  createExposedServiceValue,
  getRegisteredAppStartServices,
  getServiceMetaData,
  runServiceAppStart,
  SERVICE_RUNTIME_OVERRIDES,
  type CraftServiceProvider,
  type CompleteServiceDependencyMapFromYielded,
  type FlattenDependencyTree,
} from '@craft-ng/core';
import {
  mountInterpretedComponentTemplate,
} from './render/interpreter';
import { craftComponent } from './component';
import { executeCraftComponentFactory } from './factory-runtime';
import {
  CRAFT_COMPONENT,
  CRAFT_DIRECTIVE,
  type ComponentFactory,
  type ComponentTemplate,
  type CraftComponent,
  type CraftDirective,
  type FactoryContext,
  type FactoryYielded,
  type TemplateDependencies,
} from './types';
import type { CraftTemplateLocatorApi } from './locator';

type IsAny<T> = 0 extends 1 & T ? true : false;

type ComponentFactoryOf<Component> = Component extends CraftComponent<
  any,
  any,
  infer Factory extends ComponentFactory
>
  ? Factory
  : ComponentFactory;

type ComponentContextOf<Component> = FactoryContext<
  ComponentFactoryOf<Component>
>;

type ComponentTemplateDepsOf<Component> = Component extends CraftComponent<
  any,
  any,
  any,
  any,
  any,
  infer TemplateDeps
>
  ? TemplateDeps
  : {};

type LogicDependenciesOf<Component> = Component extends CraftComponent<
  any,
  infer Dependencies extends object
>
  ? Omit<Dependencies, 'missingProvider'> & { missingProvider: {} }
  : {};

type ServiceNamesFromNodeMap<Dependencies extends object> = IsAny<
  Dependencies
> extends true
  ? never
  : string extends keyof Dependencies
    ? never
    : Extract<keyof FlattenDependencyTree<Dependencies>, string>;

type ServiceNamesFromProperties<Properties extends object> = {
  [Name in Extract<keyof Properties, string>]: Properties[Name] extends object
    ? ServiceNamesFromNodeMap<Properties[Name]>
    : never;
}[Extract<keyof Properties, string>];

type ServiceNamesFromContract<Contract> = Contract extends object
  ? (Contract extends { deps: infer Dependencies extends object }
      ? ServiceNamesFromNodeMap<Dependencies>
      : never) |
      (Contract extends {
        propertiesDeps: infer Properties extends object;
      }
        ? ServiceNamesFromProperties<Properties>
        : never) |
      (Contract extends {
        missingProvider: infer Missing extends object;
      }
        ? ServiceNamesFromNodeMap<Missing>
        : never)
  : never;

/** The dependency contract used when only a Craft component factory is tested. */
export type CraftComponentLogicDepsOf<Component> = LogicDependenciesOf<Component>;

/** The service dependency contract used when only a Craft component template is tested. */
export type CraftComponentTemplateDepsOf<Component> = {
  deps: Record<
    Extract<
      ServiceNamesFromContract<ComponentTemplateDepsOf<Component>>,
      string
    >,
    unknown
  >;
  propertiesDeps: {};
  provided: {};
  publicProperties: {};
  missingProvider: {};
};

type DirectiveLogicFactory<Directive> = Directive extends CraftDirective<
  infer Logic,
  any,
  any
>
  ? ReturnType<Logic> extends ComponentFactory
    ? ReturnType<Logic>
    : ComponentFactory
  : ComponentFactory;

type LogicDependenciesForFactory<Factory extends ComponentFactory> = {
  deps: CompleteServiceDependencyMapFromYielded<FactoryYielded<Factory>>;
  propertiesDeps: {};
  provided: {};
  publicProperties: {};
  missingProvider: {};
};

type TemplateContractForTemplate<Template extends ComponentTemplate<any>> = {
  deps: Record<
    Extract<ServiceNamesFromContract<TemplateDependencies<Template>>, string>,
    unknown
  >;
};

/** The dependency contract added by a directive's logic decorator. */
export type CraftDirectiveLogicDepsOf<Directive> = LogicDependenciesForFactory<
  DirectiveLogicFactory<Directive>
>;

type DirectiveTemplateDependenciesOf<Directive> = Directive extends CraftDirective<
  any,
  infer Template,
  any
>
  ? Template extends (baseTemplate: ComponentTemplate<any>) => infer Decorated
    ? TemplateDependencies<Decorated>
    : {}
  : {};

/** The service dependencies used by a directive's template decorator. */
export type CraftDirectiveTemplateDepsOf<Directive> = {
  deps: Record<
    Extract<
      ServiceNamesFromContract<DirectiveTemplateDependenciesOf<Directive>>,
      string
    >,
    unknown
  >;
  propertiesDeps: {};
  provided: {};
  publicProperties: {};
  missingProvider: {};
};

type RegisterValue =
  | 'real'
  | 'provided'
  | 'notReached'
  | CraftServiceProvider
  | Record<string, unknown>;

type RegisterForNames<Names extends string> = {
  [Name in Names]: RegisterValue;
};

type RegisterForContract<Contract> = RegisterForNames<
  Extract<ServiceNamesFromContract<Contract>, string>
>;

type AppStartDecision = 'run' | 'ignore';

type TestBedOptions = {
  providers?: CraftServiceProvider[];
  appStart?: Record<string, AppStartDecision>;
};

type LogicOptions<Factory extends ComponentFactory, Contract> =
  TestBedOptions & {
    register: RegisterForContract<Contract>;
    args?: Parameters<Factory>;
  };

type TemplateOptions<Context, Contract> = TestBedOptions & {
  context: Context;
  register: RegisterForContract<Contract>;
  detectChanges?: boolean;
};

type RegisterRuntimeEntry =
  | RegisterValue
  | { readonly [CRAFT_SERVICE_PROVIDER_BRAND]?: unknown };

function isProvider(value: unknown): value is CraftServiceProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    CRAFT_SERVICE_PROVIDER_BRAND in value
  );
}

function setupTestBed(providers: readonly CraftServiceProvider[] | undefined) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [...(providers ?? [])] });
  return TestBed.inject(EnvironmentInjector);
}

function createRuntimeProviders(
  register: Record<string, RegisterRuntimeEntry>,
): { providers: CraftServiceProvider[]; mocks: Record<string, unknown> } {
  const providers: CraftServiceProvider[] = [];
  const overrides = new Map<string, { kind: 'useValue'; value: unknown }>();
  const mocks: Record<string, unknown> = {};

  for (const [name, entry] of Object.entries(register)) {
    if (entry === 'real' || entry === 'provided' || entry === 'notReached') {
      continue;
    }

    if (isProvider(entry)) {
      providers.push(entry);
      continue;
    }

    const value = createExposedServiceValue(entry);
    overrides.set(name, { kind: 'useValue', value });
    mocks[name] = value;
  }

  providers.push({
    provide: SERVICE_RUNTIME_OVERRIDES,
    useValue: overrides,
  });

  return { providers, mocks };
}

function createComponentInjector(
  component: CraftComponent<any>,
  parent: EnvironmentInjector,
  host: Element,
  register: Record<string, RegisterRuntimeEntry>,
): { injector: EnvironmentInjector; mocks: Record<string, unknown> } {
  const definition = component[CRAFT_COMPONENT];
  const { providers, mocks } = createRuntimeProviders(register);
  const injector = createEnvironmentInjector(
    [
      ...(definition.meta.providers ?? []),
      { provide: ElementRef, useValue: new ElementRef(host) },
      ...providers,
    ],
    parent,
    'CraftComponentTest',
  );

  return { injector, mocks };
}

function isActiveRegisterEntry(entry: RegisterRuntimeEntry | undefined) {
  return (
    entry === 'real' ||
    entry === 'provided' ||
    isProvider(entry)
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

async function waitForAppStart(result: unknown): Promise<void> {
  if (isPromiseLike(result)) {
    await result;
    return;
  }

  if (
    typeof result === 'object' &&
    result !== null &&
    'subscribe' in result &&
    typeof result.subscribe === 'function'
  ) {
    await new Promise<void>((resolve, reject) => {
      (
        result as {
          subscribe: (observer: {
            error: (error: unknown) => void;
            complete: () => void;
          }) => unknown;
        }
      ).subscribe({ error: reject, complete: resolve });
    });
  }
}

async function runConfiguredAppStart(
  register: Record<string, RegisterRuntimeEntry>,
  appStart: Record<string, AppStartDecision> | undefined,
  injector: Injector,
): Promise<void> {
  const references = new Map(
    getRegisteredAppStartServices().map((reference) => {
      const metadata = getServiceMetaData(reference);
      return [metadata.name, reference] as const;
    }),
  );

  const missingDecisions = Array.from(references.keys()).filter(
    (name) =>
      isActiveRegisterEntry(register[name]) && appStart?.[name] === undefined,
  );
  if (missingDecisions.length > 0) {
    throw new Error(
      `Craft testing requires appStart decisions for: ${missingDecisions.join(', ')}.`,
    );
  }

  for (const [name, decision] of Object.entries(appStart ?? {})) {
    if (decision !== 'run' && decision !== 'ignore') {
      throw new Error(
        `Invalid appStart decision for "${name}". Expected "run" or "ignore".`,
      );
    }

    const entry = register[name];
    if (!isActiveRegisterEntry(entry) || decision === 'ignore') {
      continue;
    }

    const reference = references.get(name);
    if (!reference) {
      throw new Error(
        `Register entry "${name}" is not a craftService configured with appStart: true.`,
      );
    }

    await runInInjectionContext(injector, async () => {
      const metadata = getServiceMetaData(reference);
      const value = metadata.inject();
      await waitForAppStart(runServiceAppStart(reference, value));
    });
  }
}

function componentTemplateMount<Component extends CraftComponent<any>, Context>(
  component: Component,
  context: Context,
  register: Record<string, RegisterRuntimeEntry>,
  providers: readonly CraftServiceProvider[] | undefined,
) {
  const runtime = createRuntimeProviders(register);
  const parent = setupTestBed([...(providers ?? []), ...runtime.providers]);
  const host = document.createElement('div');
  document.body.append(host);
  const mounted = mountInterpretedComponentTemplate(
    component,
    host,
    parent,
    context,
    runtime.providers,
  );

  return { host, mounted, mocks: runtime.mocks };
}

async function setupCraftComponentLogicTestImpl<
  Component extends CraftComponent<any>,
  const Contract extends CraftComponentLogicDepsOf<Component> = CraftComponentLogicDepsOf<Component>,
>(
  component: Component,
  options: LogicOptions<
    ComponentFactoryOf<Component>,
    Contract
  >,
) {
  const parent = setupTestBed(options.providers);
  const host = document.createElement('div');
  const definition = component[CRAFT_COMPONENT];
  const { injector, mocks } = createComponentInjector(
    component,
    parent,
    host,
    options.register as Record<string, RegisterRuntimeEntry>,
  );
  const factory = definition.factory;
  const args = (options.args ?? []) as Parameters<typeof factory>;
  const context = runInInjectionContext(injector, () =>
    executeCraftComponentFactory(factory, args, injector),
  ) as ComponentContextOf<Component>;

  if (isPromiseLike(context)) {
    throw new Error(
      'Async component factories are not supported by setupCraftComponentLogicTest.',
    );
  }

  await runConfiguredAppStart(
    options.register as Record<string, RegisterRuntimeEntry>,
    options.appStart,
    injector,
  );

  return {
    context,
    mocks: mocks as Record<string, unknown>,
    injector,
    destroy: () => injector.destroy(),
  };
}

export const setupCraftComponentLogicTest = Object.assign(
  setupCraftComponentLogicTestImpl,
  { byRegister: setupCraftComponentLogicTestImpl },
);

type TemplateTestResult<Component extends CraftComponent<any>, Context> =
  CraftTemplateLocatorApi<Component> & {
    nativeElement: HTMLDivElement;
    element: HTMLDivElement;
    mocks: Record<string, unknown>;
    detectChanges(): void;
    updateContext(context: Context): void;
    destroy(): void;
    toBeAccessible(): Promise<void>;
    getByRole(role: string, options?: { name?: string | RegExp }): HTMLElement;
    queryByRole(
      role: string,
      options?: { name?: string | RegExp },
    ): HTMLElement | undefined;
    getByLabel(name: string | RegExp): HTMLElement;
    queryByLabel(name: string | RegExp): HTMLElement | undefined;
  };

function matchesName(actual: string, expected: string | RegExp | undefined): boolean {
  if (expected === undefined) return true;
  return typeof expected === 'string'
    ? actual === expected
    : expected.test(actual);
}

function findById(root: ParentNode, id: string): Element | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>('[id]')).find(
    (element) => element.id === id,
  );
}

function findLabelFor(root: ParentNode, id: string): Element | undefined {
  return Array.from(root.querySelectorAll<HTMLLabelElement>('label')).find(
    (label) => label.htmlFor === id,
  );
}

function accessibleName(element: Element, root: ParentNode): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => findById(root, id)?.textContent ?? '')
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
      const label = findLabelFor(root, element.id);
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
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter((node) => {
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
      const labelled = Array.from(
        root.querySelectorAll<HTMLElement>('input, textarea, select, button'),
      ).filter(
        (node) => matchesName(accessibleName(node, root), name),
      );
      return requireSingle(labelled, `label "${String(name)}"`, false)!;
    },
    queryByLabel(name: string | RegExp) {
      const labelled = Array.from(
        root.querySelectorAll<HTMLElement>('input, textarea, select, button'),
      ).filter(
        (node) => matchesName(accessibleName(node, root), name),
      );
      return requireSingle(labelled, `label "${String(name)}"`, true);
    },
  };
}

function setupCraftComponentTemplateTestImpl<
  Component extends CraftComponent<any>,
  const Contract extends CraftComponentTemplateDepsOf<Component> = CraftComponentTemplateDepsOf<Component>,
  Context = unknown,
>(
  component: Component,
  options: TemplateOptions<Context, Contract>,
): Promise<TemplateTestResult<Component, Context>>;

async function setupCraftComponentTemplateTestImpl<
  Component extends CraftComponent<any>,
  const Contract extends CraftComponentTemplateDepsOf<Component> = CraftComponentTemplateDepsOf<Component>,
  Context = unknown,
>(
  component: Component,
  options: TemplateOptions<Context, Contract>,
) {
  const { host, mounted, mocks } = componentTemplateMount(
    component,
    options.context,
    options.register as Record<string, RegisterRuntimeEntry>,
    options.providers,
  );

  const detectChanges = () => TestBed.tick();
  if (options.detectChanges ?? true) {
    detectChanges();
  }

  const locator: CraftTemplateLocatorApi<Component>['locator'] = (
    tag: keyof HTMLElementTagNameMap,
    criteria: Readonly<Record<string, unknown>>,
  ) => mounted.locator(tag, criteria as Readonly<Record<string, unknown>>) as never;

  return {
    nativeElement: host,
    element: host,
    mocks: mocks as Record<string, unknown>,
    ...createAccessibleQueries(host),
    detectChanges,
    updateContext(context: Context) {
      mounted.updateContext(context);
    },
    locator,
    toBeAccessible: () => assertAccessible(host),
    destroy() {
      mounted.destroy();
      host.remove();
    },
  };
}

export const setupCraftComponentTemplateTest = Object.assign(
  setupCraftComponentTemplateTestImpl,
  { byRegister: setupCraftComponentTemplateTestImpl },
);

type DirectiveLogicOptions<
  BaseLogic extends ComponentFactory,
  Contract,
> = LogicOptions<
  BaseLogic,
  Contract
> & {
  baseLogic: BaseLogic;
};

async function setupCraftDirectiveLogicTestImpl<
  Directive extends CraftDirective,
  const BaseLogic extends ComponentFactory,
  const Contract extends CraftDirectiveLogicDepsOf<Directive> &
    LogicDependenciesForFactory<BaseLogic> = CraftDirectiveLogicDepsOf<Directive> &
    LogicDependenciesForFactory<BaseLogic>,
>(
  directive: Directive,
  options: DirectiveLogicOptions<BaseLogic, Contract>,
) {
  const parent = setupTestBed(options.providers);
  const host = document.createElement('div');
  const { injector, mocks } = createRuntimeDirectiveInjector(
    parent,
    host,
    options.register as Record<string, RegisterRuntimeEntry>,
  );
  const definition = directive[CRAFT_DIRECTIVE];
  const logic = definition.logic(options.baseLogic);
  const context = runInInjectionContext(injector, () =>
    executeCraftComponentFactory(
      logic,
      (options.args ?? []) as Parameters<typeof logic>,
      injector,
    ),
  ) as FactoryContext<DirectiveLogicFactory<Directive>>;

  if (isPromiseLike(context)) {
    throw new Error(
      'Async directive factories are not supported by setupCraftDirectiveLogicTest.',
    );
  }

  await runConfiguredAppStart(
    options.register as Record<string, RegisterRuntimeEntry>,
    options.appStart,
    injector,
  );

  return {
    context,
    mocks: mocks as Record<string, unknown>,
    injector,
    destroy: () => injector.destroy(),
  };
}

function createRuntimeDirectiveInjector(
  parent: EnvironmentInjector,
  host: Element,
  register: Record<string, RegisterRuntimeEntry>,
) {
  const { providers, mocks } = createRuntimeProviders(register);
  return {
    injector: createEnvironmentInjector(
      [{ provide: ElementRef, useValue: new ElementRef(host) }, ...providers],
      parent,
      'CraftDirectiveTest',
    ),
    mocks,
  };
}

export const setupCraftDirectiveLogicTest = Object.assign(
  setupCraftDirectiveLogicTestImpl,
  { byRegister: setupCraftDirectiveLogicTestImpl },
);

type DirectiveTemplateOptions<Context, Contract> = TemplateOptions<
  Context,
  Contract
> & {
  baseTemplate: ComponentTemplate<any>;
};

async function setupCraftDirectiveTemplateTestImpl<
  Directive extends CraftDirective,
  const BaseTemplate extends ComponentTemplate<any>,
  const Contract extends CraftDirectiveTemplateDepsOf<Directive> &
    TemplateContractForTemplate<BaseTemplate> = CraftDirectiveTemplateDepsOf<Directive> &
    TemplateContractForTemplate<BaseTemplate>,
  Context = unknown,
>(
  directive: Directive,
  options: DirectiveTemplateOptions<Context, Contract> & {
    baseTemplate: BaseTemplate;
  },
) {
  const definition = directive[CRAFT_DIRECTIVE];
  const decoratedTemplate = definition.template(options.baseTemplate);
  const synthetic = craftComponent(
    `CraftDirectiveTemplate:${definition.name}`,
    {
      styles: definition.meta.styles,
      stylesUrl: definition.meta.stylesUrl,
    },
    () => ({}),
    decoratedTemplate as ComponentTemplate<{}>,
  );
  const { host, mounted, mocks } = componentTemplateMount(
    synthetic,
    options.context,
    options.register as Record<string, RegisterRuntimeEntry>,
    options.providers,
  );

  const detectChanges = () => TestBed.tick();
  if (options.detectChanges ?? true) {
    detectChanges();
  }

  return {
    nativeElement: host,
    element: host,
    mocks: mocks as Record<string, unknown>,
    ...createAccessibleQueries(host),
    detectChanges,
    updateContext(context: Context) {
      mounted.updateContext(context);
    },
    destroy() {
      mounted.destroy();
      host.remove();
    },
  };
}

export const setupCraftDirectiveTemplateTest = Object.assign(
  setupCraftDirectiveTemplateTestImpl,
  { byRegister: setupCraftDirectiveTemplateTestImpl },
);

/**
 * WCAG 2.2 AA smoke checks on a mounted Craft tree. Complements axe/AccessLint
 * in application CI: images have alt, controls have a name, tabindex is not
 * positive, ARIA attributes are known.
 */
export async function assertAccessible(container: Element): Promise<void> {
  const violations: string[] = [];

  container.querySelectorAll('img').forEach((image) => {
    if (!image.hasAttribute('alt')) {
      violations.push(`<img src="${image.getAttribute('src') ?? ''}"> is missing alt`);
    }
  });

  container.querySelectorAll('button, a, [role="button"]').forEach((control) => {
    const name = (
      control.getAttribute('aria-label') ||
      control.getAttribute('aria-labelledby') ||
      control.textContent ||
      ''
    ).trim();
    if (!name && control.getAttribute('href') !== null && !(control.textContent ?? '').trim()) {
      violations.push(`<${control.tagName.toLowerCase()}> has no accessible name`);
    } else if (!name && control.tagName === 'BUTTON') {
      violations.push('<button> has no accessible name');
    }
  });

  container.querySelectorAll('[tabindex]').forEach((node) => {
    const value = Number(node.getAttribute('tabindex'));
    if (Number.isFinite(value) && value > 0) {
      violations.push(`${node.tagName.toLowerCase()} has tabIndex=${value}`);
    }
  });

  container.querySelectorAll('iframe').forEach((frame) => {
    if (!frame.getAttribute('title')) {
      violations.push('<iframe> is missing title');
    }
  });

  if (violations.length > 0) {
    throw new Error(`Accessibility violations:\n- ${violations.join('\n- ')}`);
  }
}
