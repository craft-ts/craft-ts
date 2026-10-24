import { ɵisCraftDevMode } from '@craft-ts/core';

const definitionsByScope = new WeakMap<object, string>();
const definitionsByName = new Map<string, object>();

/**
 * Returns the stable scope token associated with a Craft definition.
 *
 * The definition object is deliberately used as the identity instead of the
 * callable component. A piped component is a new callable that can still
 * share the original definition metadata.
 */
export function scopeIdFor(definition: object, name: string): string {
  const existing = definitionsByScope.get(definition);
  if (existing) return existing;

  const owner = definitionsByName.get(name);
  if (owner && owner !== definition) {
    if (ɵisCraftDevMode()) {
      const previousName = definitionsByScope.get(owner) ?? name;
      throw new Error(
        `Craft style scope name "${name}" is already used by "${previousName}". ` +
          'Component and directive names must be unique.',
      );
    }
  }

  definitionsByScope.set(definition, name);
  definitionsByName.set(name, definition);
  return name;
}
