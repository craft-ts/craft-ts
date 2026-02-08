import { effect, inject, Injector, untracked } from '@angular/core';
import {
  AsyncStateWithParams,
  PersistedState,
  StatePersister,
} from './util/persister.type';

export function localStoragePersisterV2<State, Params, Identifier>(
  data: PersistedState<State, Params, Identifier>,
): StatePersister {
  const _injector = inject(Injector);

  const storageKey = getStorageKey(data.prefix, data.key, 'state');

  hydrateFromStorage<State, Params, Identifier>(data, storageKey);
  const isAsyncState = !!data.asyncStateManager;
  if (isAsyncState) {
    effect(() => {
      const asyncStateWithParams = data.asyncStateManager?.stateWithParams();
      const isStable = data.asyncStateManager?.isStable() ?? true;

      if (!isStable || !asyncStateWithParams) {
        untracked(() => {
          localStorage.removeItem(storageKey);
        });
        return;
      }
      // todo vérfieir ce que renvoie le asyncStatewithparams
      console.log('asyncStateWithParams', asyncStateWithParams);

      untracked(() => {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            state: asyncStateWithParams,
            timestamp: Date.now(),
          }),
        );
      });
    });
  } else {
    effect(() => {
      const { state } = data;
      const currentState = state();

      untracked(() => {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            state: currentState,
            timestamp: Date.now(),
          }),
        );
      });
    });
  }

  return {
    clear: () => {
      localStorage.removeItem(storageKey);
    },
  };
}

function getStorageKey(prefix: string, key: string, type: string) {
  return `ng-craft-${prefix}-${type}-${key}`;
}

function isValueExpired(timestamp: number, cacheTime: number): boolean {
  return Date.now() - timestamp > cacheTime;
}

function hydrateFromStorage<State, Params, Identifier extends string | unknown>(
  data: PersistedState<State, Params, Identifier>,
  storageKey: string,
) {
  const isAsyncState = !!data.asyncStateManager;
  const isStable = isAsyncState ? data.asyncStateManager?.isStable() : true;
  if (!isStable) {
    localStorage.removeItem(storageKey);
    return;
  }
  const storedValue = localStorage.getItem(storageKey);
  if (!storedValue) {
    return;
  }
  try {
    const { state, timestamp } = JSON.parse(storedValue);

    if (
      timestamp &&
      data.cacheTime > 0 &&
      isValueExpired(timestamp, data.cacheTime)
    ) {
      localStorage.removeItem(storageKey);
      return;
    }

    if (isAsyncState) {
      debugger;
      data.asyncStateManager?.setAsyncState({
        state: state.state,
        params: state.params,
      } as AsyncStateWithParams<Identifier, State, Params>);
    } else {
      data.set(state);
    }
  } catch (e) {
    console.error('Error parsing stored value from localStorage', e);
    localStorage.removeItem(storageKey);
  }
}
