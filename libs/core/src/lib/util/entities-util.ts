/**
 * Type to extract the identifier from an entity
 */
export type IdSelector<Entity, Key = string | number> = (entity: Entity) => Key;

/**
 * Type for partial updates
 */
export type Update<T, K = string | number> = {
  id: K;
  changes: Partial<T>;
};

export type EntitiesUtilBrand<Name> = { __brand: Name };

/**
 * Helper function to get the default identifier.
 * For primitives (string | number), the entity itself is used as the identifier.
 * For objects with an `id` property, the `id` property is used.
 */
function getDefaultIdentifier<T, K>(): IdSelector<T, K> {
  return (e: T) => {
    if (typeof e === 'string' || typeof e === 'number') {
      return e as unknown as K;
    }
    return (e as T & { id: K }).id;
  };
}

/**
 * Removes all elements from the list
 */
export function removeAll<T>(): T[] & EntitiesUtilBrand<'removeAll'> {
  return [] as unknown as T[] & EntitiesUtilBrand<'removeAll'>;
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
}): T[] & EntitiesUtilBrand<'addOne'> {
  return [...entities, entity] as T[] & EntitiesUtilBrand<'addOne'>;
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
}): T[] & EntitiesUtilBrand<'addMany'> {
  return [...entities, ...newEntities] as T[] & EntitiesUtilBrand<'addMany'>;
}

/**
 * Replaces the entire list with new elements
 */
export function setAll<T>({
  newEntities,
}: {
  newEntities: T[];
}): T[] & EntitiesUtilBrand<'setAll'> {
  return [...newEntities] as T[] & EntitiesUtilBrand<'setAll'>;
}

/**
 * Replaces or adds an element (based on id).
 * If the entity has an `id` property, the identifier is optional.
 * For primitives (string | number), the entity itself is used as the identifier.
 */
export function setOne<T extends string | number>(params: {
  entity: T;
  entities: T[];
  identifier?: IdSelector<T, T>;
}): T[] & EntitiesUtilBrand<'setOne'>;
export function setOne<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  entity: T;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'setOne'>;
export function setOne<T, K = string | number>(params: {
  entity: T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'setOne'>;
export function setOne<T, K = string | number>({
  entity,
  entities,
  identifier,
}: {
  entity: T;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'setOne'> {
  const getId = identifier ?? getDefaultIdentifier<T, K>();
  const id = getId(entity);
  const index = entities.findIndex((e) => getId(e) === id);

  if (index === -1) {
    return [...entities, entity] as T[] & EntitiesUtilBrand<'setOne'>;
  }

  return entities.map((e, i) => (i === index ? entity : e)) as T[] &
    EntitiesUtilBrand<'setOne'>;
}

/**
 * Replaces or adds multiple elements (based on id).
 * If the entity has an `id` property, the identifier is optional.
 * For primitives (string | number), the entity itself is used as the identifier.
 */
export function setMany<T extends string | number>(params: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, T>;
}): T[] & EntitiesUtilBrand<'setMany'>;
export function setMany<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'setMany'>;
export function setMany<T, K = string | number>(params: {
  newEntities: T[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'setMany'>;
export function setMany<T, K = string | number>({
  newEntities,
  entities,
  identifier,
}: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'setMany'> {
  const getId = identifier ?? getDefaultIdentifier<T, K>();
  let result = [...entities];

  for (const entity of newEntities) {
    result = setOne({ entity, entities: result, identifier: getId }) as T[];
  }

  return result as T[] & EntitiesUtilBrand<'setMany'>;
}

/**
 * Partially updates an existing element.
 * If the entity has an `id` property, the identifier is optional.
 * For primitives (string | number), the entity itself is used as the identifier.
 */
export function updateOne<T extends string | number>(params: {
  update: Update<T, T>;
  entities: T[];
  identifier?: IdSelector<T, T>;
}): T[] & EntitiesUtilBrand<'updateOne'>;
export function updateOne<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  update: Update<T, K>;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'updateOne'>;
export function updateOne<T, K = string | number>(params: {
  update: Update<T, K>;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'updateOne'>;
export function updateOne<T, K = string | number>({
  update,
  entities,
  identifier,
}: {
  update: Update<T, K>;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'updateOne'> {
  const getId = identifier ?? getDefaultIdentifier<T, K>();
  const index = entities.findIndex((e) => getId(e) === update.id);

  if (index === -1) {
    return entities as T[] & EntitiesUtilBrand<'updateOne'>;
  }

  return entities.map((e, i) =>
    i === index ? { ...e, ...update.changes } : e,
  ) as T[] & EntitiesUtilBrand<'updateOne'>;
}

/**
 * Partially updates multiple existing elements.
 * If the entity has an `id` property, the identifier is optional.
 * For primitives (string | number), the entity itself is used as the identifier.
 */
export function updateMany<T extends string | number>(params: {
  updates: Update<T, T>[];
  entities: T[];
  identifier?: IdSelector<T, T>;
}): T[] & EntitiesUtilBrand<'updateMany'>;
export function updateMany<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  updates: Update<T, K>[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'updateMany'>;
export function updateMany<T, K = string | number>(params: {
  updates: Update<T, K>[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'updateMany'>;
export function updateMany<T, K = string | number>({
  updates,
  entities,
  identifier,
}: {
  updates: Update<T, K>[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'updateMany'> {
  const getId = identifier ?? getDefaultIdentifier<T, K>();
  let result = [...entities];

  for (const update of updates) {
    result = updateOne({ update, entities: result, identifier: getId }) as T[];
  }

  return result as T[] & EntitiesUtilBrand<'updateMany'>;
}

/**
 * Updates an element if it exists, otherwise adds it.
 * If the entity has an `id` property, the identifier is optional.
 * For primitives (string | number), the entity itself is used as the identifier.
 */
export function upsertOne<T extends string | number>(params: {
  entity: T;
  entities: T[];
  identifier?: IdSelector<T, T>;
}): T[] & EntitiesUtilBrand<'upsertOne'>;
export function upsertOne<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  entity: T;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'upsertOne'>;
export function upsertOne<T, K = string | number>(params: {
  entity: T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'upsertOne'>;
export function upsertOne<T, K = string | number>({
  entity,
  entities,
  identifier,
}: {
  entity: T;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'upsertOne'> {
  const getId = identifier ?? getDefaultIdentifier<T, K>();
  const id = getId(entity);
  const index = entities.findIndex((e) => getId(e) === id);

  if (index === -1) {
    return [...entities, entity] as T[] & EntitiesUtilBrand<'upsertOne'>;
  }

  // For primitives, just replace; for objects, merge
  const isPrimitive = typeof entity === 'string' || typeof entity === 'number';
  return entities.map((e, i) =>
    i === index ? (isPrimitive ? entity : { ...e, ...entity }) : e,
  ) as T[] & EntitiesUtilBrand<'upsertOne'>;
}

/**
 * Updates multiple elements if they exist, otherwise adds them.
 * If the entity has an `id` property, the identifier is optional.
 * For primitives (string | number), the entity itself is used as the identifier.
 */
export function upsertMany<T extends string | number>(params: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, T>;
}): T[] & EntitiesUtilBrand<'upsertMany'>;
export function upsertMany<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'upsertMany'>;
export function upsertMany<T, K = string | number>(params: {
  newEntities: T[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'upsertMany'>;
export function upsertMany<T, K = string | number>({
  newEntities,
  entities,
  identifier,
}: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'upsertMany'> {
  const getId = identifier ?? getDefaultIdentifier<T, K>();
  let result = [...entities];

  for (const entity of newEntities) {
    result = upsertOne({ entity, entities: result, identifier: getId }) as T[];
  }

  return result as T[] & EntitiesUtilBrand<'upsertMany'>;
}

/**
 * Removes an element by its id.
 * If the entity has an `id` property, the identifier is optional.
 * For primitives (string | number), the entity itself is used as the identifier.
 */
export function removeOne<T extends string | number>(params: {
  id: T;
  entities: T[];
  identifier?: IdSelector<T, T>;
}): T[] & EntitiesUtilBrand<'removeOne'>;
export function removeOne<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  id: K;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'removeOne'>;
export function removeOne<T, K = string | number>(params: {
  id: K;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'removeOne'>;
export function removeOne<T, K = string | number>({
  id,
  entities,
  identifier,
}: {
  id: K;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'removeOne'> {
  const getId = identifier ?? getDefaultIdentifier<T, K>();
  return entities.filter((e) => getId(e) !== id) as T[] &
    EntitiesUtilBrand<'removeOne'>;
}

/**
 * Removes multiple elements by their ids.
 * If the entity has an `id` property, the identifier is optional.
 * For primitives (string | number), the entity itself is used as the identifier.
 */
export function removeMany<T extends string | number>(params: {
  ids: T[];
  entities: T[];
  identifier?: IdSelector<T, T>;
}): T[] & EntitiesUtilBrand<'removeMany'>;
export function removeMany<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  ids: K[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'removeMany'>;
export function removeMany<T, K = string | number>(params: {
  ids: K[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'removeMany'>;
export function removeMany<T, K = string | number>({
  ids,
  entities,
  identifier,
}: {
  ids: K[];
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'removeMany'> {
  const getId = identifier ?? getDefaultIdentifier<T, K>();
  const idSet = new Set(ids);
  return entities.filter((e) => !idSet.has(getId(e))) as T[] &
    EntitiesUtilBrand<'removeMany'>;
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
}): T[] & EntitiesUtilBrand<'map'> {
  return entities.map(mapFn) as T[] & EntitiesUtilBrand<'map'>;
}

/**
 * Applies a transformation function to a single element by its id.
 * If the entity has an `id` property, the identifier is optional.
 * For primitives (string | number), the entity itself is used as the identifier.
 */
export function mapOne<T extends string | number>(params: {
  id: T;
  mapFn: (entity: T) => T;
  entities: T[];
  identifier?: IdSelector<T, T>;
}): T[] & EntitiesUtilBrand<'mapOne'>;
export function mapOne<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  id: K;
  mapFn: (entity: T) => T;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'mapOne'>;
export function mapOne<T, K = string | number>(params: {
  id: K;
  mapFn: (entity: T) => T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[] & EntitiesUtilBrand<'mapOne'>;
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
}): T[] & EntitiesUtilBrand<'mapOne'> {
  const getId = identifier ?? getDefaultIdentifier<T, K>();
  return entities.map((e) => (getId(e) === id ? mapFn(e) : e)) as T[] &
    EntitiesUtilBrand<'mapOne'>;
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
 * For primitives (string | number), the entity itself is used as the identifier.
 */
export function computedIds<T extends string | number>(params: {
  entities: T[];
  identifier?: IdSelector<T, T>;
}): T[] & EntitiesUtilBrand<'computedIds'>;
export function computedIds<
  T extends { id: K },
  K = T extends { id: infer I } ? I : string | number,
>(params: {
  entities: T[];
  identifier?: IdSelector<T, K>;
}): K[] & EntitiesUtilBrand<'computedIds'>;
export function computedIds<T, K = string | number>(params: {
  entities: T[];
  identifier: IdSelector<T, K>;
}): K[] & EntitiesUtilBrand<'computedIds'>;
export function computedIds<T, K = string | number>({
  entities,
  identifier,
}: {
  entities: T[];
  identifier?: IdSelector<T, K>;
}): K[] & EntitiesUtilBrand<'computedIds'> {
  const getId = identifier ?? getDefaultIdentifier<T, K>();
  return entities.map(getId) as K[] & EntitiesUtilBrand<'computedIds'>;
}
