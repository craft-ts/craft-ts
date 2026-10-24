/** A value as the reader a template binding takes. */
export const lit = <Value>(value: Value) =>
  function* (): Generator<never, Value, never> {
    return value;
  };

/** The value of the control an event came from, without asserting its type. */
export function eventValue(event: Event): string {
  const target = event.target;
  if (target && 'value' in target && typeof target.value === 'string') {
    return target.value;
  }
  return '';
}
