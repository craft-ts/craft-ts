/**
 * A lens describes how to read a derived value from a source, and how to
 * write a new derived value back into the source. Used by `insertSubFormField`
 * to expose computed sub-fields that stay in sync with their parent.
 */
export type FieldLens<Source, Sub> = {
  read: (source: Source) => Sub;
  write: (source: Source, next: Sub) => Source;
};

/**
 * Lens that exposes the `index`-th half of a string split by `separator`.
 * The write reassembles the source while preserving the other half.
 *
 * @example
 *   // source = '2026-05-10 12:00'
 *   splitLens(' ', 0).read(source)            // '2026-05-10'
 *   splitLens(' ', 0).write(source, '2026-05-11') // '2026-05-11 12:00'
 */
export const splitLens = (
  separator: string,
  index: 0 | 1,
): FieldLens<string, string> => ({
  read: (source) => source.split(separator)[index] ?? '',
  write: (source, next) => {
    const parts = source.split(separator);
    while (parts.length <= index) parts.push('');
    parts[index] = next;
    return parts.join(separator);
  },
});

/**
 * Pure 1-to-1 conversion lens. The write does not depend on the previous
 * source value — typical for type conversions like `Number ↔ string` or
 * `Date ↔ ISO string`.
 *
 * @example
 *   mapLens<string, number>((s) => Number(s), (n) => String(n))
 */
export const mapLens = <A, B>(
  forward: (a: A) => B,
  backward: (b: B) => A,
): FieldLens<A, B> => ({
  read: forward,
  write: (_source, next) => backward(next),
});
