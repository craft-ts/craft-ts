import {
  craftComputed,
  craftService,
  craftUnique,
  insertReactOnMutation,
  insertStoragePersister,
  isCraftException,
  mutation,
  query,
  state,
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

/**
 * Ce qu'il faut ajouter au panier serveur pour qu'il ait ces lignes : une
 * quantité négative retire.
 */
function cartDeltas(
  current: readonly CartLine[],
  wanted: readonly CartLine[],
): readonly CartLine[] {
  const keys = new Set([...current, ...wanted].map(lineKey));
  return [...keys].flatMap((key) => {
    const before = current.find((line) => lineKey(line) === key);
    const after = wanted.find((line) => lineKey(line) === key);
    const delta = (after?.quantity ?? 0) - (before?.quantity ?? 0);
    const line = after ?? before;
    return line && delta !== 0 ? [{ ...line, quantity: delta }] : [];
  });
}

export const { Cart } = craftService(
  { name: 'cart', providedIn: 'global' },
  function* () {
    // Les méthodes d'un state tournent avec le pilote synchrone : elles
    // changent les lignes locales et confient le serveur à `syncServerCart`.
    const cartLines = yield* state(
      'cartLines',
      [] as readonly CartLine[],
      function* ({ set, update, state, patch, insertions }) {
        const context = { set, update, state, patch, insertions };
        const persistence = yield* insertStoragePersister(
          craftUnique({ storeName: 'atelier', key: 'cart.v1' }),
        )(context);
        const changed = function* () {
          yield* syncServerCart.mutate(yield* context.state());
        };
        return {
          ...persistence,
          add: function* (line: CartLine) {
            yield* context.update((lines) => mergeLine(lines, line));
            yield* changed();
          },
          shift: function* (key: string, delta: number) {
            if (delta === 0) return;
            yield* context.update((lines) => shiftQuantity(lines, key, delta));
            yield* changed();
          },
          remove: function* (key: string) {
            yield* context.update((lines) =>
              lines.filter((item) => lineKey(item) !== key),
            );
            yield* changed();
          },
          clear: function* () {
            yield* context.set([]);
            yield* changed();
          },
        };
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
        return {
          ...persistence,
          replace: (cart: ServerCart | undefined) => context.set(cart),
        };
      },
    );
    /** Aligne le panier serveur sur ces lignes, en le créant s'il le faut. */
    const syncLines = function* (
      lines: readonly CartLine[],
    ): Generator<unknown, ServerCart | undefined, unknown> {
      let cart = yield* cartState();
      if (cart) {
        const remote = yield* getCart({ cartId: cart.id });
        cart = isCraftException(remote) ? undefined : remote;
      }
      if (!cart) {
        const created = yield* createCart({});
        if (isCraftException(created)) return undefined;
        cart = created;
      }
      let synced: ServerCart = cart;
      for (const delta of cartDeltas(synced.lines, lines)) {
        const updated: ServerCart = yield* addCartLine({
          cartId: synced.id,
          line: delta,
        });
        if (isCraftException(updated)) return undefined;
        synced = updated;
      }
      yield* cartState.replace(synced);
      return synced;
    };
    const syncServerCart = yield* mutation('syncServerCart', {
      method: (lines: readonly CartLine[]) => lines,
      loader: function* ({ params: lines }) {
        return yield* syncLines(lines);
      },
    });
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
    const currentSession = yield* state(
      'currentSession',
      undefined as AccountSession | undefined,
      function* ({ set, update, state, patch, insertions }) {
        const context = { set, update, state, patch, insertions };
        const persistence = yield* insertStoragePersister(
          craftUnique({ storeName: 'atelier', key: 'session.v1' }),
        )(context);
        return {
          ...persistence,
          open: (session: AccountSession) => context.set(session),
          close: () => context.set(undefined),
        };
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
    yield* query(
      'currentUser',
      {
        params: function* () {
          return (yield* currentSession())?.token;
        },
        loader: function* ({ params: token }) {
          if (!token) return undefined;
          return yield* currentUser({ token });
        },
      },
      insertReactOnMutation(signInProcess, {}),
    );
    yield* query('signOutProcess', {
      method: (token: string) => token,
      // Le serveur d'abord : fermer la session avant l'appel l'interrompait,
      // et le jeton restait valide côté serveur.
      loader: function* ({ params: token }) {
        const result = yield* signOut({ token });
        yield* currentSession.close();
        return result;
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
