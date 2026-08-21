export type CraftServerStyleCollector = Readonly<{
  acquire(key: string, css: string, order: number): () => void;
  cssText(): string;
}>;

export function createServerStyleCollector(): CraftServerStyleCollector {
  const entries = new Map<
    string,
    { readonly css: string; readonly order: number; refs: number }
  >();
  return {
    acquire(key, css, order) {
      const current = entries.get(key);
      if (current) current.refs += 1;
      else entries.set(key, { css, order, refs: 1 });
      return () => {
        const entry = entries.get(key);
        if (!entry) return;
        entry.refs = Math.max(0, entry.refs - 1);
      };
    },
    cssText: () =>
      [...entries.values()]
        .sort((left, right) => left.order - right.order)
        .map((entry) => entry.css)
        .join('\n'),
  };
}
