/**
 * Minimal className composer — joins truthy string args with single spaces.
 * Avoids pulling in `clsx`/`classnames` as a dependency for one helper.
 *
 *   cn("btn", isPrimary && "btn--primary", undefined, "size-md")
 *     -> "btn btn--primary size-md"
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p)).join(" ");
}
