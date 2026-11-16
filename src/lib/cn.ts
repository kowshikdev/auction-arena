/** Joins class names, skipping falsy values. Plain module so server and client components can both use it. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
