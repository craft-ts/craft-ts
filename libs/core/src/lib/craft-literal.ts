/**
 * Declares a technical string value — a state discriminant, a `data-*`
 * attribute token, a `matchNode` key — as opposed to text shown to a user.
 *
 * It returns `value` unchanged at runtime and preserves its literal type, so a
 * computed that returns one of several marked values is inferred as their
 * union without a type annotation:
 *
 * ```ts
 * const drawerOpen = craftLiteral('open');
 * const drawerClosed = craftLiteral('closed');
 *
 * const drawerState = craftComputed('drawerState', function* () {
 *   return (yield* open()) ? drawerOpen : drawerClosed;
 * }); // reads as 'open' | 'closed'
 * ```
 *
 * Declare one value per call and reuse it wherever the token is compared or
 * bound. The `craft-ts/require-i18n-text` ESLint rule accepts the literal
 * passed to `craftLiteral(...)` as a technical value, but still asks for
 * `i18n.t(...)` when a marked value reaches a visible text position (a text
 * child, `placeholder`, `aria-label`, `title`…): user-facing copy always comes
 * from the catalogue.
 *
 * @param value The technical token.
 * @returns `value`, typed as its literal.
 */
export function craftLiteral<const T extends string>(value: T): T {
  return value;
}
