// todo handle update of array of objects
export function createNestedStateUpdate({
  state,
  keysPath,
  value,
}: {
  state: any;
  keysPath: string[];
  value: any;
}): any {
  if (keysPath.length === 0) {
    return value;
  }

  const [currentKey, ...remainingKeys] = keysPath;
  const currentState = state[currentKey] || {};

  return {
    ...state,
    [currentKey]:
      remainingKeys.length === 0
        ? Array.isArray(currentState)
          ? value
          : typeof value === 'object' && value !== null && !Array.isArray(value)
          ? { ...currentState, ...value }
          : value
        : createNestedStateUpdate({
            state: currentState,
            keysPath: remainingKeys,
            value,
          }),
  };
}
export function getNestedStateValue({
  state,
  keysPath,
}: {
  state: any;
  keysPath: string[];
}): any {
  return keysPath.reduce((currentState, key) => {
    if (currentState && typeof currentState === 'object') {
      return currentState[key];
    }
    return undefined;
  }, state);
}
