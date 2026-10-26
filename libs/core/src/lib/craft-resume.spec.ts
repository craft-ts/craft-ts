import { describe, expect, it } from 'vitest';
import { Equal, Expect } from 'test-type';
import {
  craftResume,
  craftResumeResource,
  withResume,
  ɵresolveCraftResume,
  ɵwithResumeSpecOf,
  type CraftResumePath,
} from './craft-resume';

type Session = { readonly token: string; readonly user: { readonly id: string } };
const session = craftResumeResource<'session', Session | undefined>('session');

describe('craftResume', () => {
  it('stores the name of a typed resource, never the resource object', () => {
    const declaration = craftResume({ resource: session, role: 'holds', path: '$.token' });
    expect(declaration).toEqual({ resource: 'session', role: 'holds', path: '$.token' });
    expect(Object.isFrozen(declaration)).toBe(true);
  });

  it('builds a factory declaration once its primitive exists', () => {
    let value = 1;
    const spec = craftResume((self) => ({
      resource: 'counter',
      role: 'restores',
      read: () => self(),
      write: (next) => self.set(next),
    }));
    const resolved = ɵresolveCraftResume(
      spec,
      Object.assign(() => value, { set: (next: unknown) => void (value = next as number) }),
    );
    expect(resolved?.resource).toBe('counter');
    resolved?.write?.(5);
    expect(resolved?.read?.()).toBe(5);
  });

  it('marks a state declaration with withResume', () => {
    const declaration = craftResume({ resource: 'cart', role: 'restores' });
    expect(ɵwithResumeSpecOf(withResume(declaration))).toBe(declaration);
    expect(ɵwithResumeSpecOf({ resume: declaration })).toBeUndefined();
  });

  it('types adapters and paths by the resource value', () => {
    type Paths = CraftResumePath<Session>;
    type _paths = Expect<Equal<'$.user.id' extends Paths ? true : false, true>>;
    type _untyped = Expect<Equal<CraftResumePath<unknown>, string>>;
    // Each refusal fits on one line: an overloaded call reports its error
    // where the arguments start.
    // @ts-expect-error -- the session has no `secret` field.
    craftResume({ resource: session, role: 'holds', path: '$.secret' });
    // @ts-expect-error -- a holder of the session cannot be written a number.
    craftResume({ resource: session, role: 'holds', write: (value: number) => value });
    // @ts-expect-error -- an acquisition must produce the session.
    craftResume({ resource: session, role: 'provides', acquire: () => 42 });
    craftResume({ resource: session, role: 'holds', path: '$.user.id', write: (value) => value?.token });
    expect(true).toBe(true);
  });
});
