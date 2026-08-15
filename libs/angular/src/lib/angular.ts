import {
  ApplicationRef,
  Component,
  createComponent,
  EnvironmentInjector,
  inputBinding,
  outputBinding,
  signal,
  type Binding,
  type ComponentRef,
  type DirectiveWithBindings,
  type Injector,
  type Type,
} from '@angular/core';
export {
  computed as ɵangularComputed,
  createEnvironmentInjector as ɵcreateAngularEnvironmentInjector,
  ElementRef as ɵAngularElementRef,
  EnvironmentInjector as ɵAngularEnvironmentInjector,
  Injector as ɵAngularInjector,
  reflectComponentType as ɵreflectAngularComponentType,
  runInInjectionContext as ɵrunInAngularInjectionContext,
  signal as ɵangularSignal,
  untracked as ɵangularUntracked,
} from '@angular/core';
export type {
  EffectRef as ɵAngularEffectRef,
  Provider as ɵAngularProvider,
  ProviderToken as ɵAngularProviderToken,
} from '@angular/core';
import {
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';

type HostInjector = Injector;
type HostType<T> = Type<T>;

export interface AngularDirectiveNode {
  readonly type: HostType<unknown>;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly outputs?: Readonly<Record<string, (value: unknown) => unknown>>;
}

export interface AngularComponentNode {
  readonly kind: 'angular';
  readonly component: HostType<unknown>;
  readonly injector?: HostInjector;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly outputs: Readonly<Record<string, (value: unknown) => unknown>>;
  readonly directives: readonly AngularDirectiveNode[];
}

export interface AngularMountOptions {
  readonly injector?: Injector;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly outputs?: Readonly<Record<string, (value: unknown) => unknown>>;
  readonly directives?: readonly AngularDirectiveNode[];
}

export interface AngularMountContext {
  readonly injector: Injector;
  readonly resolveInput: (value: unknown) => unknown;
  readonly executeOutput: (
    callback: (value: unknown) => unknown,
    value: unknown,
  ) => unknown;
}

export function angular(
  component: Type<unknown>,
  options: AngularMountOptions = {},
): AngularComponentNode {
  return {
    kind: 'angular',
    component,
    injector: options.injector,
    inputs: options.inputs ?? {},
    outputs: options.outputs ?? {},
    directives: options.directives ?? [],
  };
}

export function directive(
  type: Type<unknown>,
  options: Omit<AngularMountOptions, 'directives'> = {},
): AngularDirectiveNode {
  return {
    type,
    inputs: options.inputs,
    outputs: options.outputs,
  };
}

function angularBindings(
  getInputs: () => Readonly<Record<string, unknown>>,
  getOutputs: () => Readonly<Record<string, (value: unknown) => unknown>>,
  context: AngularMountContext,
): Binding[] {
  return [
    ...Object.keys(getInputs()).map((name) =>
      inputBinding(name, () => context.resolveInput(getInputs()[name])),
    ),
    ...Object.keys(getOutputs()).map((name) =>
      outputBinding(name, (value) =>
        context.executeOutput(getOutputs()[name]!, value),
      ),
    ),
  ];
}

function angularDirectives(
  source: ReturnType<typeof signal<readonly AngularDirectiveNode[]>>,
  context: AngularMountContext,
): DirectiveWithBindings<unknown>[] {
  return source().map((descriptor, index) => ({
    type: descriptor.type,
    bindings: angularBindings(
      () => source()[index]?.inputs ?? {},
      () => source()[index]?.outputs ?? {},
      context,
    ),
  }));
}

export class AngularMount {
  private readonly descriptorSource;
  private readonly directiveSource;
  private readonly componentRef: ComponentRef<unknown>;
  private readonly applicationRef: ApplicationRef;

  constructor(
    component: Type<unknown>,
    hostElement: Element,
    injector: Injector | undefined,
    inputs: Readonly<Record<string, unknown>>,
    outputs: Readonly<Record<string, (value: unknown) => unknown>>,
    directives: readonly AngularDirectiveNode[],
    context: AngularMountContext,
  ) {
    const elementInjector = injector ?? context.injector;
    this.descriptorSource = signal({ inputs, outputs, directives });
    this.directiveSource = signal(directives);
    this.applicationRef = context.injector.get(ApplicationRef);
    this.componentRef = createComponent(component, {
      environmentInjector: elementInjector.get(EnvironmentInjector),
      elementInjector,
      hostElement,
      bindings: angularBindings(
        () => this.descriptorSource().inputs,
        () => this.descriptorSource().outputs,
        context,
      ),
      directives: angularDirectives(this.directiveSource, context),
    });
    this.applicationRef.attachView(this.componentRef.hostView);
    this.componentRef.changeDetectorRef.detectChanges();
  }

  update(
    inputs: Readonly<Record<string, unknown>>,
    outputs: Readonly<Record<string, (value: unknown) => unknown>>,
    directives: readonly AngularDirectiveNode[],
  ): void {
    this.descriptorSource.set({ inputs, outputs, directives });
    this.directiveSource.set(directives);
    this.componentRef.changeDetectorRef.detectChanges();
  }

  destroy(): void {
    this.applicationRef.detachView(this.componentRef.hostView);
    this.componentRef.destroy();
  }
}

@Component({
  selector: 'craft-angular-directive-host',
  standalone: true,
  template: '',
})
export class CraftAngularDirectiveHost {}

export type GenDeps_CraftAngularDirectiveHost = GetDeps<{
  deps: {};
  propertiesDeps: {};
  provided: {};
  publicProperties: GetPublicComponentProperties<CraftAngularDirectiveHost>;
}>;
