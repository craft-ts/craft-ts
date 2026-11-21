import { replaceOnce } from './prepare.mjs';
export function guardInitialBindings(source) {
  source = replaceOnce(
    source,
    '/**\n * The effect of one binding, and what it owes its boundaries.',
    `// A synchronous constructor frame, restored across nested binding creation.
// The existing callback catches only its first unhandled failure, so the
// kernel returns its stop handle before that failure leaves the constructor.
const initializingBinding: { current: RenderBindingEffect | undefined } = { current: undefined };
let initialBindingFailed = false;
let initialBindingError: unknown;

/**
 * The effect of one binding, and what it owes its boundaries.`,
  );
  return replaceOnce(
    source,
    `    this.effect = new ɵCraftRenderEffect(
      name,
      () => this.run(),
      context.injector,
      ambient,
    );`,
    `    const previousBinding = initializingBinding.current,
      previousFailed = initialBindingFailed,
      previousError = initialBindingError;
    initializingBinding.current = this;
    initialBindingFailed = false;
    initialBindingError = undefined;
    try {
      this.effect = new ɵCraftRenderEffect(
        name,
        () => {
          try {
            this.run();
          } catch (error) {
            if (initializingBinding.current !== this) throw error;
            initialBindingFailed = true;
            initialBindingError = error;
          }
        },
        context.injector,
        ambient,
      );
      if (initialBindingFailed) {
        const failure = initialBindingError;
        try {
          this.effect.destroy();
        } catch {
          /* Preserve the first render error. */
        }
        throw failure;
      }
    } finally {
      initializingBinding.current = previousBinding;
      initialBindingFailed = previousFailed;
      initialBindingError = previousError;
    }`,
  );
}
