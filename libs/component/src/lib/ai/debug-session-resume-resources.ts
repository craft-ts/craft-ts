/** Resource values cross only the dashboard's live postMessage bridge. */
export type DebugSessionResumeResource = Readonly<{
  resource: string;
  value: unknown;
}>;

const MAX_RESOURCE_NAME_LENGTH = 160;
const MAX_RESOURCE_BYTES = 64 * 1024;

/** Accept bounded JSON data only; functions, cycles and host objects stay local. */
export function normalizeDebugSessionResumeResource(
  value: unknown,
): DebugSessionResumeResource | undefined {
  if (
    !isRecord(value) ||
    typeof value['resource'] !== 'string' ||
    value['resource'].length === 0 ||
    value['resource'].length > MAX_RESOURCE_NAME_LENGTH ||
    !Object.hasOwn(value, 'value')
  )
    return undefined;
  try {
    const serialized = JSON.stringify(value['value']);
    if (
      serialized === undefined ||
      new TextEncoder().encode(serialized).byteLength > MAX_RESOURCE_BYTES
    )
      return undefined;
    return {
      resource: value['resource'],
      value: JSON.parse(serialized) as unknown,
    };
  } catch {
    return undefined;
  }
}

export function debugSessionResumeResourcesRecord(
  resources: ReadonlyMap<string, unknown>,
): Readonly<Record<string, unknown>> {
  const result = Object.create(null) as Record<string, unknown>;
  for (const [resource, value] of resources) {
    const normalized = normalizeDebugSessionResumeResource({ resource, value });
    if (normalized) result[resource] = normalized.value;
  }
  return result;
}

export function debugSessionResumeResourcesMap(
  value: unknown,
): Map<string, unknown> {
  if (!isRecord(value)) return new Map();
  const resources = new Map<string, unknown>();
  for (const [resource, resourceValue] of Object.entries(value)) {
    const normalized = normalizeDebugSessionResumeResource({
      resource,
      value: resourceValue,
    });
    if (normalized) resources.set(resource, normalized.value);
  }
  return resources;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
