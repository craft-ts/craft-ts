import { craftComputed, craftService, isCraftException, query, state } from '@craft-ts/core';
import { signIn, signOut } from './api';
import { lineKey } from './shop-format';
import type { AccountSession } from '../shared/accounts';
import type { CartLine, ChoiceGroup } from '../shared/model';

// Ces services sont globaux : l'en-tête, la vitrine et le panier lisent le même
// état, et un état déclaré dans le corps d'un composant repartirait de zéro à
// chaque nouveau rendu de ce composant.

const cartKey = 'atelier.cart.v1';
const sessionKey = 'atelier.session.v1';

function readStored<A>(key: string, fallback: A): A {
  try { return (JSON.parse(localStorage.getItem(key) ?? 'null') as A | null) ?? fallback; }
  catch { return fallback; }
}
function store<A>(key: string, value: A): A {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* stockage indisponible : l'état reste en mémoire */ }
  return value;
}

function mergeLine(lines: readonly CartLine[], line: CartLine): readonly CartLine[] {
  const key = lineKey(line);
  return lines.some((item) => lineKey(item) === key)
    ? lines.map((item) => lineKey(item) === key ? { ...item, quantity: item.quantity + line.quantity } : item)
    : [...lines, line];
}
function shiftQuantity(lines: readonly CartLine[], key: string, delta: number): readonly CartLine[] {
  return lines.flatMap((item) => {
    if (lineKey(item) !== key) return [item];
    const quantity = item.quantity + delta;
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
}

export const { Cart } = craftService({ name: 'cart', providedIn: 'global' }, function* () {
  const cartLines = yield* state('cartLines', readStored<readonly CartLine[]>(cartKey, []), ({ update, set }) => ({
    add: (line: CartLine) => update((lines) => store(cartKey, mergeLine(lines, line))),
    shift: (key: string, delta: number) => update((lines) => store(cartKey, shiftQuantity(lines, key, delta))),
    remove: (key: string) => update((lines) => store(cartKey, lines.filter((item) => lineKey(item) !== key))),
    clear: () => set(store(cartKey, [])),
  }));
  yield* craftComputed('cartCount', function* () {
    return (yield* cartLines()).reduce((sum, line) => sum + line.quantity, 0);
  });
});

/** Quantité d'un produit dans le panier, toutes compositions confondues. */
export const quantityInCart = (lines: readonly CartLine[], productId: string) =>
  lines.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0);

export const { Session } = craftService({ name: 'session', providedIn: 'global' }, function* () {
  const currentSession = yield* state('currentSession', readStored<AccountSession | undefined>(sessionKey, undefined), ({ set }) => ({
    open: (session: AccountSession) => set(store(sessionKey, session)),
    close: () => set(store<AccountSession | undefined>(sessionKey, undefined)),
  }));
  const sessionNotice = yield* state('sessionNotice', undefined as string | undefined, ({ set }) => ({
    show: (message: string | undefined) => set(message),
  }));
  yield* query('signInProcess', {
    method: (credentials: { readonly email: string; readonly password: string }) => credentials,
    loader: function* ({ params }) {
      const result = yield* signIn(params);
      if (!isCraftException(result)) {
        yield* currentSession.open(result);
        yield* sessionNotice.show(undefined);
      }
      return result;
    },
  });
  yield* query('signOutProcess', {
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
});

type FormulaPicks = Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;

function togglePick(picks: FormulaPicks, formulaId: string, group: ChoiceGroup, productId: string): FormulaPicks {
  const groups = picks[formulaId] ?? {};
  const selected = groups[group.id] ?? [];
  let next: readonly string[];
  if (selected.includes(productId)) next = selected.filter((id) => id !== productId);
  // Un groupe à choix unique se comporte comme des boutons radio.
  else if (group.max === 1) next = [productId];
  else if (selected.length >= group.max) next = selected;
  else next = [...selected, productId];
  return { ...picks, [formulaId]: { ...groups, [group.id]: next } };
}

export const { ShopUi } = craftService({ name: 'shopUi', providedIn: 'global' }, function* () {
  yield* state('categoryFilter', 'all', ({ set }) => ({
    choose: (categoryId: string) => set(categoryId),
  }));
  yield* state('formulaPicks', {} as FormulaPicks, ({ update }) => ({
    toggle: (formulaId: string, group: ChoiceGroup, productId: string) => update((picks) => togglePick(picks, formulaId, group, productId)),
    forget: (formulaId: string) => update((picks) => ({ ...picks, [formulaId]: {} })),
  }));
});
