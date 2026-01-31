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
 * Replaces or adds an element (based on id).
 * If the entity has an `id` property, the identifier is optional.
 */
export function setOne<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: { entity: T; entities: T[]; identifier?: IdSelector<T, K> }): T[];
export function setOne<T, K = string | number>(params: {
  entity: T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
export function setOne<T, K = string | number>({
  entity,
  entities,
  identifier,
}: {
  entity: T;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] {
  const getId = identifier ?? ((e: T) => (e as T & { id: K }).id);
  const id = getId(entity);
  const index = entities.findIndex((e) => getId(e) === id);

  if (index === -1) {
    return [...entities, entity];
  }

  return entities.map((e, i) => (i === index ? entity : e));
}

/**
 * Replaces or adds multiple elements (based on id).
 * If the entity has an `id` property, the identifier is optional.
 */
export function setMany<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[];
export function setMany<T, K = string | number>(params: {
  newEntities: T[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
export function setMany<T, K = string | number>({
  newEntities,
  entities,
  identifier,
}: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] {
  const getId = identifier ?? ((e: T) => (e as T & { id: K }).id);
  let result = [...entities];

  for (const entity of newEntities) {
    result = setOne({ entity, entities: result, identifier: getId });
  }

  return result;
}

/**
 * Partially updates an existing element.
 * If the entity has an `id` property, the identifier is optional.
 */
export function updateOne<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  update: Update<T, K>;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[];
export function updateOne<T, K = string | number>(params: {
  update: Update<T, K>;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
export function updateOne<T, K = string | number>({
  update,
  entities,
  identifier,
}: {
  update: Update<T, K>;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] {
  const getId = identifier ?? ((e: T) => (e as T & { id: K }).id);
  const index = entities.findIndex((e) => getId(e) === update.id);

  if (index === -1) {
    return entities;
  }

  return entities.map((e, i) =>
    i === index ? { ...e, ...update.changes } : e,
  );
}

/**
 * Partially updates multiple existing elements.
 * If the entity has an `id` property, the identifier is optional.
 */
export function updateMany<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  updates: Update<T, K>[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[];
export function updateMany<T, K = string | number>(params: {
  updates: Update<T, K>[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
export function updateMany<T, K = string | number>({
  updates,
  entities,
  identifier,
}: {
  updates: Update<T, K>[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] {
  const getId = identifier ?? ((e: T) => (e as T & { id: K }).id);
  let result = [...entities];

  for (const update of updates) {
    result = updateOne({ update, entities: result, identifier: getId });
  }

  return result;
}

/**
 * Updates an element if it exists, otherwise adds it.
 * If the entity has an `id` property, the identifier is optional.
 */
export function upsertOne<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: { entity: T; entities: T[]; identifier?: IdSelector<T, K> }): T[];
export function upsertOne<T, K = string | number>(params: {
  entity: T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
export function upsertOne<T, K = string | number>({
  entity,
  entities,
  identifier,
}: {
  entity: T;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] {
  const getId = identifier ?? ((e: T) => (e as T & { id: K }).id);
  const id = getId(entity);
  const index = entities.findIndex((e) => getId(e) === id);

  if (index === -1) {
    return [...entities, entity];
  }

  return entities.map((e, i) => (i === index ? { ...e, ...entity } : e));
}

/**
 * Updates multiple elements if they exist, otherwise adds them.
 * If the entity has an `id` property, the identifier is optional.
 */
export function upsertMany<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[];
export function upsertMany<T, K = string | number>(params: {
  newEntities: T[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
export function upsertMany<T, K = string | number>({
  newEntities,
  entities,
  identifier,
}: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] {
  const getId = identifier ?? ((e: T) => (e as T & { id: K }).id);
  let result = [...entities];

  for (const entity of newEntities) {
    result = upsertOne({ entity, entities: result, identifier: getId });
  }

  return result;
}

/**
 * Removes an element by its id.
 * If the entity has an `id` property, the identifier is optional.
 */
export function removeOne<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: { id: K; entities: T[]; identifier?: IdSelector<T, K> }): T[];
export function removeOne<T, K = string | number>(params: {
  id: K;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
export function removeOne<T, K = string | number>({
  id,
  entities,
  identifier,
}: {
  id: K;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] {
  const getId = identifier ?? ((e: T) => (e as T & { id: K }).id);
  return entities.filter((e) => getId(e) !== id);
}

/**
 * Removes multiple elements by their ids.
 * If the entity has an `id` property, the identifier is optional.
 */
export function removeMany<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: { ids: K[]; entities: T[]; identifier?: IdSelector<T, K> }): T[];
export function removeMany<T, K = string | number>(params: {
  ids: K[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
export function removeMany<T, K = string | number>({
  ids,
  entities,
  identifier,
}: {
  ids: K[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] {
  const getId = identifier ?? ((e: T) => (e as T & { id: K }).id);
  const idSet = new Set(ids);
  return entities.filter((e) => !idSet.has(getId(e)));
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
 * Applies a transformation function to a single element by its id.
 * If the entity has an `id` property, the identifier is optional.
 */
export function mapOne<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  id: K;
  mapFn: (entity: T) => T;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[];
export function mapOne<T, K = string | number>(params: {
  id: K;
  mapFn: (entity: T) => T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
export function mapOne<T, K = string | number>({
  id,
  mapFn,
  entities,
  identifier,
}: {
  id: K;
  mapFn: (entity: T) => T;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] {
  const getId = identifier ?? ((e: T) => (e as T & { id: K }).id);
  return entities.map((e) => (getId(e) === id ? mapFn(e) : e));
}

/**
 * Returns the total count of entities
 */
export function computedTotal<T>({ entities }: { entities: T[] }): number {
  return entities.length;
}

/**
 * Returns all ids from the entities list.
 * If the entity has an `id` property, the identifier is optional.
 */
export function computedIds<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: { entities: T[]; identifier?: IdSelector<T, K> }): K[];
export function computedIds<T, K = string | number>(params: {
  entities: T[];
  identifier: IdSelector<T, K>;
}): K[];
export function computedIds<T, K = string | number>({
  entities,
  identifier,
}: {
  entities: T[];
  identifier?: IdSelector<T, K>;
}): K[] {
  const getId = identifier ?? ((e: T) => (e as T & { id: K }).id);
  return entities.map(getId);
}
