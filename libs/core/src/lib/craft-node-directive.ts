import { runInInjectionContext, type EffectRef, type Injector } from './host/craft-compat';
import { craftService, type CraftServiceProvider } from './craft-service';
import {
  CRAFT_REGISTRATION_TARGET,
  type CraftRegistrationTarget,
} from './craft-register-for-runtime';
import type { CraftDomAdapter } from './host/craft-dom';

/** Runtime marker shared by core-authored DOM directives and the Craft renderer. */
export const CRAFT_NODE_DIRECTIVE = Symbol.for(
  '@craft-ts/core/craft-node-directive',
);

/** Creates a reactive effect owned by the current node-directive mount. */
export type CraftNodeEffectFactory = (
  name: string,
  effectFn: () => void,
) => EffectRef;

const craftNodeEffectFactoryService = craftService(
  { name: 'CraftNodeEffectFactory', providedIn: 'toProvide' },
  (inputs: { $provided: CraftNodeEffectFactory }) => inputs.$provided,
) as unknown as {
  CraftNodeEffectFactory: () => Generator<unknown, CraftNodeEffectFactory, unknown>;
  provideCraftNodeEffectFactory: (value: CraftNodeEffectFactory) => CraftServiceProvider;
  CRAFT_NODE_EFFECT_FACTORY_META_DATA: { inject(): CraftNodeEffectFactory };
};

export const CraftNodeEffectFactory = craftNodeEffectFactoryService.CraftNodeEffectFactory;
export const provideCraftNodeEffectFactory = (
  value: CraftNodeEffectFactory,
): CraftServiceProvider => craftNodeEffectFactoryService.provideCraftNodeEffectFactory(value);
export const ɵinjectCraftNodeEffectFactoryIn = (
  injector: Injector,
): CraftNodeEffectFactory =>
  runInInjectionContext(injector, () =>
    craftNodeEffectFactoryService.CRAFT_NODE_EFFECT_FACTORY_META_DATA.inject(),
  );

/** The element-scoped services and reactive inputs available to a DOM directive. */
export interface CraftNodeDirectiveContext<
  Props extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
> {
  readonly element: Element;
  readonly injector: Injector;
  readonly renderer: CraftDomAdapter;
  /**
   * The current directive inputs. Reading this property inside an effect tracks
   * input updates without remounting the directive.
   */
  readonly props: Props;
}

export type CraftNodeDirectiveMount<
  Props extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
> = (context: CraftNodeDirectiveContext<Props>) => void | (() => void);

export interface CraftNodeDirectiveDefinition<
  Props extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
> {
  readonly name: string;
  readonly inputs: readonly (keyof Props & string)[];
  readonly mount: CraftNodeDirectiveMount<Props>;
}

export interface CraftNodeDirective<
  Props extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
> extends CraftRegistrationTarget<
    string,
    'directive',
    CraftNodeDirectiveContext<Props>
  > {
  readonly [CRAFT_NODE_DIRECTIVE]: CraftNodeDirectiveDefinition<Props>;
}

/** Creates a functional directive mounted directly on a rendered DOM node. */
export function craftNodeDirective<
  const Props extends Readonly<Record<string, unknown>>,
>(
  name: string,
  inputs: readonly (keyof Props & string)[],
  mount: CraftNodeDirectiveMount<Props>,
): CraftNodeDirective<Props> {
  const directive = (() => undefined) as unknown as CraftNodeDirective<Props>;

  Object.defineProperty(directive, CRAFT_NODE_DIRECTIVE, {
    value: { name, inputs, mount },
    enumerable: false,
  });
  Object.defineProperty(directive, CRAFT_REGISTRATION_TARGET, {
    value: { kind: 'directive', name },
    enumerable: false,
  });

  return directive;
}

export function isCraftNodeDirective(
  value: unknown,
): value is CraftNodeDirective<any> {
  return typeof value === 'function' && CRAFT_NODE_DIRECTIVE in value;
}
