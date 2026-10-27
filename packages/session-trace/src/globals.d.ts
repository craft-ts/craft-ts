// The only host globals the module uses. Browsers and Node both provide them;
// declaring them here keeps DOM and Node types out of the package build.
declare class TextEncoder { encode(input: string): Uint8Array }
declare class URL {
  constructor(url: string, base?: string);
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly searchParams: { keys(): IterableIterator<string> };
}
