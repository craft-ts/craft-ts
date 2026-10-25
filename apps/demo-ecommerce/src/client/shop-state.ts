import {
  craftComputed,
  craftResume,
  craftService,
  craftUnique,
  insertQueryPipe,
  insertReactOnMutation,
  insertStoragePersister,
  isCraftException,
  mutation,
  query,
  state,
  ɵRAW_REACTIVE_VALUE,
} from '@craft-ts/core';
import {
  addCartLine,
  createCart,
  currentUser,
  getCart,
  signIn,
  signOut,
} from './api';
import { lineKey } from './shop-format';
import type { CraftResumePersona } from '@craft-ts/core';
import type { AccountSession } from '../shared/accounts';
import type { CartLine, ChoiceGroup, ServerCart } from '../shared/model';

// Ces services sont globaux : l'en-tête, la vitrine et le panier lisent le même
// état, et un état déclaré dans le corps d'un composant repartirait de zéro à
// chaque nouveau rendu de ce composant.

function mergeLine(
  lines: readonly CartLine[],
  line: CartLine,
): readonly CartLine[] {
  const key = lineKey(line);
  return lines.some((item) => lineKey(item) === key)
    ? lines.map((item) =>
        lineKey(item) === key
          ? { ...item, quantity: item.quantity + line.quantity }
          : item,
      )
    : [...lines, line];
}
function shiftQuantity(
  lines: readonly CartLine[],
  key: string,
  delta: number,
): readonly CartLine[] {
  return lines.flatMap((item) => {
    if (lineKey(item) !== key) return [item];
    const quantity = item.quantity + delta;
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
}

export const { Cart } = craftService(
  { name: 'cart', providedIn: 'global' },
  function* () {
    let ensureServerCart: () => Generator<
      unknown,
      ServerCart | undefined,
      unknown
    > = function* () {
      return undefined;
    };
    let readCartLines: () => readonly CartLine[] = () => [];
    let writeCartLines: (lines: readonly CartLine[]) => unknown = () => undefined;
    let storedServerCart: ServerCart | undefined;
    let reacquireServerCart: () => unknown = () => undefined;
    let readServerCart: () => ServerCart | undefined = () => storedServerCart;
    let writeServerCart: (cart: ServerCart) => unknown = () => undefined;
    const acquireServerCart = yield* mutation('acquireServerCart', {
      resume: craftResume({
        resource: 'cart',
        role: 'provides',
        persona: 'guest',
        calls: ['ecommerce.cart.create', 'ecommerce.cart.addLine'],
        acquire: () => reacquireServerCart(),
      }),
      method: () => true,
      loader: function* () {
        return yield* createCart({});
      },
    });
    reacquireServerCart = () => acquireServerCart.mutate(true);
    const cartLines = yield* state(
      'cartLines',
      [] as readonly CartLine[],
      function* ({ set, update, state, patch, insertions }) {
        const context = { set, update, state, patch, insertions };
        const persistence = yield* insertStoragePersister(
          craftUnique({ storeName: 'atelier', key: 'cart.v1' }),
        )(context);
        const rawState = context.state[
          ɵRAW_REACTIVE_VALUE
        ] as unknown as (() => readonly CartLine[]) & {
          set(value: readonly CartLine[]): void;
        };
        readCartLines = rawState;
        writeCartLines = function* (lines) {
          yield* context.set(lines);
        };
        return {
          ...persistence,
          add: function* (line: CartLine) {
            const cart = yield* ensureServerCart();
            if (cart) {
              const updated = yield* addCartLine({ cartId: cart.id, line });
              if (!isCraftException(updated)) {
                yield* cartState.replace(updated);
                yield* context.set(updated.lines);
                return;
              }
            }
            yield* context.update((lines) => mergeLine(lines, line));
          },
          shift: function* (key: string, delta: number) {
            const current = yield* context.state();
            const line = current.find((item) => lineKey(item) === key);
            if (!line || delta === 0) return;
            const cart = yield* ensureServerCart();
            if (cart) {
              const updated = yield* addCartLine({
                cartId: cart.id,
                line: { ...line, quantity: delta },
              });
              if (!isCraftException(updated)) {
                yield* cartState.replace(updated);
                yield* context.set(updated.lines);
                return;
              }
            }
            yield* context.update((lines) => shiftQuantity(lines, key, delta));
          },
          remove: function* (key: string) {
            const current = yield* context.state();
            const line = current.find((item) => lineKey(item) === key);
            if (!line) return;
            const cart = yield* ensureServerCart();
            if (cart) {
              const updated = yield* addCartLine({
                cartId: cart.id,
                line: { ...line, quantity: -line.quantity },
              });
              if (!isCraftException(updated)) {
                yield* cartState.replace(updated);
                yield* context.set(updated.lines);
                return;
              }
            }
            yield* context.update((lines) =>
              lines.filter((item) => lineKey(item) !== key),
            );
          },
          replaceLines: (lines: readonly CartLine[]) => context.set(lines),
          clear: function* () {
            const current = yield* context.state();
            const cart = yield* ensureServerCart();
            if (cart) {
              let updated: ServerCart = cart;
              for (const line of current) {
                const result = yield* addCartLine({
                  cartId: cart.id,
                  line: { ...line, quantity: -line.quantity },
                });
                if (!isCraftException(result)) updated = result;
              }
              yield* cartState.replace(updated);
            }
            yield* context.set([]);
          },
        };
      },
      {
        resume: craftResume({
          resource: 'cart',
          role: 'restores',
          value: [] as readonly CartLine[],
          read: () => readCartLines(),
          write: (value) =>
            Array.isArray(value)
              ? writeCartLines(value as readonly CartLine[])
              : undefined,
        }),
      },
    );
    const cartState = yield* state(
      'serverCart',
      undefined as ServerCart | undefined,
      function* ({ set, update, state, patch, insertions }) {
        const context = { set, update, state, patch, insertions };
        const persistence = yield* insertStoragePersister(
          craftUnique({ storeName: 'atelier', key: 'cart.server.v1' }),
        )(context);
        const rawState = context.state[
          ɵRAW_REACTIVE_VALUE
        ] as unknown as (() => ServerCart | undefined) & {
          set(value: ServerCart | undefined): void;
        };
        readServerCart = rawState;
        writeServerCart = function* (cart) {
          storedServerCart = cart;
          yield* context.set(cart);
        };
        return {
          ...persistence,
          replace: (cart: ServerCart) => {
            storedServerCart = cart;
            return context.set(cart);
          },
        };
      },
      {
        resume: craftResume({
          resource: 'cart',
          role: 'holds',
          path: '$.id',
          read: () => readServerCart()?.id,
          write: (value) => {
            if (
              typeof value === 'object' &&
              value !== null &&
              'id' in value &&
              typeof value.id === 'string' &&
              'lines' in value &&
              Array.isArray(value.lines)
            )
              writeServerCart(value as ServerCart);
            else if (typeof value === 'string')
              writeServerCart({
                id: value,
                lines: readServerCart()?.lines ?? [],
              });
          },
        }),
      },
    );
    reacquireServerCart = function* () {
      const created = yield* createCart({});
      if (!created || isCraftException(created)) return created;
      let restored: ServerCart = created;
      for (const line of readCartLines()) {
        const result = yield* addCartLine({ cartId: created.id, line });
        if (isCraftException(result)) return result;
        restored = result;
      }
      yield* cartState.replace(restored);
      return restored;
    };
    ensureServerCart = function* () {
      const stored = storedServerCart ?? (yield* cartState());
      if (stored) {
        const remote = yield* getCart({ cartId: stored.id });
        if (!isCraftException(remote)) {
          yield* cartState.replace(remote);
          yield* cartLines.replaceLines(remote.lines);
          return remote;
        }
      }
      yield* acquireServerCart.mutate(true);
      const created = yield* acquireServerCart.value();
      if (!created || isCraftException(created)) return undefined;
      yield* cartState.replace(created);
      const current = yield* cartLines();
      let synced = created;
      for (const line of current) {
        const result = yield* addCartLine({ cartId: created.id, line });
        if (!isCraftException(result)) synced = result;
      }
      yield* cartState.replace(synced);
      return synced;
    };
    yield* craftComputed('cartCount', function* () {
      return (yield* cartLines()).reduce((sum, line) => sum + line.quantity, 0);
    });
  },
);

/** Quantité d'un produit dans le panier, toutes compositions confondues. */
export const quantityInCart = (lines: readonly CartLine[], productId: string) =>
  lines
    .filter((line) => line.productId === productId)
    .reduce((sum, line) => sum + line.quantity, 0);

export const { Session } = craftService(
  { name: 'session', providedIn: 'global' },
  function* () {
    let writeSession: (value: unknown) => unknown = () => undefined;
    let reacquiredSession: AccountSession | undefined;
    let reloadCurrentUser: () => Generator<unknown, boolean, unknown> =
      function* () {
        return false;
      };
    let reacquireSession: (persona: CraftResumePersona) => unknown = () =>
      undefined;
    const currentSession = yield* state(
      'currentSession',
      undefined as AccountSession | undefined,
      function* ({ set, update, state, patch, insertions }) {
        const context = { set, update, state, patch, insertions };
        const persistence = yield* insertStoragePersister(
          craftUnique({ storeName: 'atelier', key: 'session.v1' }),
        )(context);
        writeSession = function* (value) {
          // L’acquisition produit un nouveau jeton serveur. La substitution de
          // l’état archivé intervient ensuite : conserver ce jeton évite de
          // réinstaller celui qui appartenait à l’ancienne session.
          const session = value as AccountSession | undefined;
          if (session) reacquiredSession = session;
          yield* context.set(session);
        };
        return {
          ...persistence,
          open: (session: AccountSession) => context.set(session),
          close: () => context.set(undefined),
        };
      },
      {
        resume: craftResume({
          resource: 'session',
          role: 'holds',
          path: '$.token',
          calls: ['ecommerce.product.save'],
          expect: { outcome: 'recorded' },
          write: (value) => writeSession(value),
        }),
      },
    );
    const sessionNotice = yield* state(
      'sessionNotice',
      undefined as string | undefined,
      ({ set }) => ({
        show: (message: string | undefined) => set(message),
      }),
    );
    const signInProcess = yield* mutation('signInProcess', {
      resume: craftResume({
        resource: 'session',
        role: 'provides',
        persona: 'product-manager',
        calls: ['ecommerce.auth.login', 'ecommerce.auth.me'],
        acquire: (persona) => reacquireSession(persona),
      }),
      method: (credentials: {
        readonly email: string;
        readonly password: string;
      }) => credentials,
      loader: function* ({ params }) {
        const result = yield* signIn(params);
        if (!isCraftException(result)) {
          yield* currentSession.open(result);
          yield* sessionNotice.show(undefined);
        }
        return result;
      },
    });
    reacquireSession = function* (persona) {
      const email = persona.params['email'];
      const password = persona.params['password'];
      if (typeof email !== 'string' || typeof password !== 'string')
        throw new Error(
          `La persona '${persona.role}' n’a pas d’identifiants locaux valides.`,
        );
      const session = yield* signIn({ email, password });
      if (isCraftException(session))
        throw new Error('La réacquisition de la session a échoué.');
      reacquiredSession = session;
      yield* currentSession.open(session);
      yield* reloadCurrentUser();
      return session;
    };
    yield* query(
      'currentUser',
      {
        resume: craftResume({
          resource: 'session',
          role: 'requires',
          identity: true,
          calls: ['ecommerce.auth.me'],
        }),
        params: function* () {
          return (yield* currentSession())?.token;
        },
        loader: function* ({ params: token }) {
          if (!token) return undefined;
          const session = reacquiredSession;
          const result = yield* currentUser({ token: session?.token ?? token });
          if (session && !isCraftException(result)) reacquiredSession = undefined;
          return result;
        },
      },
      insertQueryPipe(
        insertReactOnMutation(signInProcess, {}),
        ({ reload }) => {
          reloadCurrentUser = () => reload();
          return {};
        },
      ),
    );
    yield* query('signOutProcess', {
      resume: craftResume({ resource: 'session', role: 'revokes' }),
      method: (token: string) => token,
      loader: function* ({ params: token }) {
        yield* currentSession.close();
        return yield* signOut({ token });
      },
    });
    // Ce que l'interface laisse ouvrir ; le serveur décide action par action.
    yield* craftComputed('isStaff', function* () {
      const role = (yield* currentSession())?.user.role;
      return role === 'admin' || role === 'product-manager';
    });
  },
);

type FormulaPicks = Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
>;

function togglePick(
  picks: FormulaPicks,
  formulaId: string,
  group: ChoiceGroup,
  productId: string,
): FormulaPicks {
  const groups = picks[formulaId] ?? {};
  const selected = groups[group.id] ?? [];
  let next: readonly string[];
  if (selected.includes(productId))
    next = selected.filter((id) => id !== productId);
  // Un groupe à choix unique se comporte comme des boutons radio.
  else if (group.max === 1) next = [productId];
  else if (selected.length >= group.max) next = selected;
  else next = [...selected, productId];
  return { ...picks, [formulaId]: { ...groups, [group.id]: next } };
}

export const { ShopUi } = craftService(
  { name: 'shopUi', providedIn: 'global' },
  function* () {
    yield* state('categoryFilter', 'all', ({ set }) => ({
      choose: (categoryId: string) => set(categoryId),
    }));
    yield* state('searchTerm', '', ({ set }) => ({
      search: (value: string) => set(value),
    }));
    yield* state('formulaPicks', {} as FormulaPicks, ({ update }) => ({
      toggle: (formulaId: string, group: ChoiceGroup, productId: string) =>
        update((picks) => togglePick(picks, formulaId, group, productId)),
      forget: (formulaId: string) =>
        update((picks) => ({ ...picks, [formulaId]: {} })),
    }));
  },
);
