import { computed, Signal, signal } from './host/craft-compat';
import { AnyCraftException } from './craft-exception';

type ResourceExceptionScope = 'params' | 'loader';

type ResourceExceptionsNoId = {
  list: AnyCraftException[];
  params: AnyCraftException | {};
  loader: AnyCraftException | {};
};

type ResourceExceptionsById = {
  list: AnyCraftException[];
  params: AnyCraftException | {};
  loader: Record<string, AnyCraftException>;
};

export function enrichResourceException(
  exception: AnyCraftException,
  meta: {
    scope: ResourceExceptionScope;
    identifier?: string;
  },
): AnyCraftException {
  const nextException = {
    ...exception,
    scope: meta.scope,
    [exception._tag]: exception.payload,
  } as AnyCraftException & {
    scope: ResourceExceptionScope;
    identifier?: string;
  };

  if (meta.identifier !== undefined) {
    nextException.identifier = meta.identifier;
  } else {
    delete nextException.identifier;
  }

  return nextException;
}

export function removeResourceExceptionById(
  state: Record<string, AnyCraftException>,
  id: string,
): Record<string, AnyCraftException> {
  if (!(id in state)) {
    return state;
  }

  const nextState = { ...state };
  delete nextState[id];
  return nextState;
}

export function createResourceExceptionsRuntime({
  isUsingIdentifier,
  paramsException,
}: {
  isUsingIdentifier: boolean;
  paramsException: Signal<AnyCraftException | undefined>;
}) {
  const loaderException = signal<AnyCraftException | undefined>(undefined);
  const loaderExceptionsById = signal<Record<string, AnyCraftException>>({});

  const setLoaderException = (
    exception: AnyCraftException | undefined,
    id?: string,
  ) => {
    if (isUsingIdentifier) {
      if (!id) {
        return;
      }
      loaderExceptionsById.update((state) =>
        exception
          ? { ...state, [id]: exception }
          : removeResourceExceptionById(state, id),
      );
      return;
    }

    loaderException.set(exception);
  };

  const exceptions = computed<ResourceExceptionsNoId | ResourceExceptionsById>(
    () => {
      const paramsExceptionValue = paramsException();

      if (isUsingIdentifier) {
        const loaderExceptionsByIdValue = loaderExceptionsById();
        return {
          list: [
            ...(paramsExceptionValue ? [paramsExceptionValue] : []),
            ...Object.values(loaderExceptionsByIdValue),
          ],
          params: (paramsExceptionValue ?? {}) as AnyCraftException | {},
          loader: loaderExceptionsByIdValue,
        };
      }

      const loaderExceptionValue = loaderException();
      return {
        list: [paramsExceptionValue, loaderExceptionValue].filter(
          Boolean,
        ) as AnyCraftException[],
        params: (paramsExceptionValue ?? {}) as AnyCraftException | {},
        loader: (loaderExceptionValue ?? {}) as AnyCraftException | {},
      };
    },
  );

  const hasException = computed(() => {
    if (paramsException()) {
      return true;
    }

    if (isUsingIdentifier) {
      return Object.keys(loaderExceptionsById()).length > 0;
    }

    return !!loaderException();
  });

  const createSelectExceptions = (id: string) =>
    computed<ResourceExceptionsNoId>(() => {
      const paramsExceptionValue = paramsException();
      const loaderExceptionValue = loaderExceptionsById()?.[id];

      return {
        list: [paramsExceptionValue, loaderExceptionValue].filter(
          Boolean,
        ) as AnyCraftException[],
        params: (paramsExceptionValue ?? {}) as AnyCraftException | {},
        loader: (loaderExceptionValue ?? {}) as AnyCraftException | {},
      };
    });

  const createSelectHasException = (id: string) =>
    computed(() => !!paramsException() || !!loaderExceptionsById()[id]);

  return {
    setLoaderException,
    exceptions,
    hasException,
    createSelectExceptions,
    createSelectHasException,
  };
}
