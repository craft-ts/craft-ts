/**
 * Type to extract the identifier from an entity
 */
export type IdSelector<T, K = string | number> = (entity: T) => K;

/**
 * Type for partial updates
 */
export type Update<T, K = string | number> = {
  id: K;
  changes: Partial<T>;
};

/**
 * Removes all elements from the list
 */
export function removeAll<T>(): T[] {
  return [];
}

/**
 * Adds an element to the end of the list
 */
export function addOne<T>({
  entity,
  entities,
}: {
  entity: T;
  entities: T[];
}): T[] {
  return [...entities, entity];
}

/**
 * Adds multiple elements to the end of the list
 */
export function addMany<T>({
  newEntities,
  entities,
}: {
  newEntities: T[];
  entities: T[];
}): T[] {
  return [...entities, ...newEntities];
}

/**
 * Replaces the entire list with new elements
 */
export function setAll<T>({ newEntities }: { newEntities: T[] }): T[] {
  return [...newEntities];
}

/**
 * Replaces or adds an element (based on id)
 */
export function setOne<T, K = string | number>({
  entity,
  entities,
  identifier,
}: {
  entity: T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] {
  const id = identifier(entity);
  const index = entities.findIndex((e) => identifier(e) === id);

  if (index === -1) {
    return [...entities, entity];
  }

  return entities.map((e, i) => (i === index ? entity : e));
}

/**
 * Replaces or adds multiple elements (based on id)
 */
export function setMany<T, K = string | number>({
  newEntities,
  entities,
  identifier,
}: {
  newEntities: T[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] {
  let result = [...entities];

  for (const entity of newEntities) {
    result = setOne({ entity, entities: result, identifier });
  }

  return result;
}

/**
 * Partially updates an existing element
 */
export function updateOne<T, K = string | number>({
  update,
  entities,
  identifier,
}: {
  update: Update<T, K>;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] {
  const index = entities.findIndex((e) => identifier(e) === update.id);

  if (index === -1) {
    return entities;
  }

  return entities.map((e, i) =>
    i === index ? { ...e, ...update.changes } : e,
  );
}

/**
 * Partially updates multiple existing elements
 */
export function updateMany<T, K = string | number>({
  updates,
  entities,
  identifier,
}: {
  updates: Update<T, K>[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] {
  let result = [...entities];

  for (const update of updates) {
    result = updateOne({ update, entities: result, identifier });
  }

  return result;
}

/**
 * Updates an element if it exists, otherwise adds it
 */
export function upsertOne<T, K = string | number>({
  entity,
  entities,
  identifier,
}: {
  entity: T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] {
  const id = identifier(entity);
  const index = entities.findIndex((e) => identifier(e) === id);

  if (index === -1) {
    return [...entities, entity];
  }

  return entities.map((e, i) => (i === index ? { ...e, ...entity } : e));
}

/**
 * Updates multiple elements if they exist, otherwise adds them
 */
export function upsertMany<T, K = string | number>({
  newEntities,
  entities,
  identifier,
}: {
  newEntities: T[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] {
  let result = [...entities];

  for (const entity of newEntities) {
    result = upsertOne({ entity, entities: result, identifier });
  }

  return result;
}

/**
 * Removes an element by its id
 */
export function removeOne<T, K = string | number>({
  id,
  entities,
  identifier,
}: {
  id: K;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] {
  return entities.filter((e) => identifier(e) !== id);
}

/**
 * Removes multiple elements by their ids
 */
export function removeMany<T, K = string | number>({
  ids,
  entities,
  identifier,
}: {
  ids: K[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] {
  const idSet = new Set(ids);
  return entities.filter((e) => !idSet.has(identifier(e)));
}

/**
 * Applies a transformation function to all elements
 */
export function map<T>({
  mapFn,
  entities,
}: {
  mapFn: (entity: T) => T;
  entities: T[];
}): T[] {
  return entities.map(mapFn);
}

/**
 * Applies a transformation function to a single element by its id
 */
export function mapOne<T, K = string | number>({
  id,
  mapFn,
  entities,
  identifier,
}: {
  id: K;
  mapFn: (entity: T) => T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] {
  return entities.map((e) => (identifier(e) === id ? mapFn(e) : e));
}

/**
 * Returns the total count of entities
 */
export function computedTotal<T>({ entities }: { entities: T[] }): number {
  return entities.length;
}

/**
 * Returns all ids from the entities list
 */
export function computedIds<T, K = string | number>({
  entities,
  identifier,
}: {
  entities: T[];
  identifier: IdSelector<T, K>;
}): K[] {
  return entities.map(identifier);
}
