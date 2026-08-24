/**
 * Resource names carry the application and the stage.
 *
 * Two stages of the same application share one Alchemy account, so a name that
 * omits the stage makes a preview deployment overwrite production.
 */
export function alchemyResourceName(
  application: string,
  stage: string,
  suffix: string,
): string {
  return [application, stage, suffix]
    .map((part) =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter((part) => part.length > 0)
    .join('-');
}
