// What jsdom leaves out of the browser the review app reads.
if (typeof globalThis.ClipboardEvent !== 'function') {
  globalThis.ClipboardEvent = class ClipboardEvent extends Event {
    readonly clipboardData: DataTransfer | null;
    constructor(type: string, init: ClipboardEventInit = {}) {
      super(type, init);
      this.clipboardData = init.clipboardData ?? null;
    }
  } as typeof ClipboardEvent;
}
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    },
  });
}
if (typeof globalThis.CSS?.escape !== 'function') {
  globalThis.CSS = {
    ...globalThis.CSS,
    escape: (value: string) => value.replace(/([^\w-])/g, '\\$1'),
  } as typeof CSS;
}
