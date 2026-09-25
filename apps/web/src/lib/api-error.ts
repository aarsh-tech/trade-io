/** Human-readable text from an axios/Nest error: joins validation message arrays, falls back to `fallback`. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.filter((m) => typeof m === "string").join(" · ") || fallback;
  return typeof message === "string" && message ? message : fallback;
}
