/** Only ever send people back to a page inside this app (never off-site, never `//host`). */
export function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
