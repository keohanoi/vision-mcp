/**
 * Tolerantly extract a JSON value (object or array) from a model response that
 * may include surrounding prose or ```json code fences. Returns null if no
 * parseable JSON is found.
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;

  // Strip a ```json ... ``` (or ``` ... ```) fence if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : text;

  // Direct parse of the whole thing.
  try {
    return JSON.parse(candidate.trim()) as T;
  } catch {
    // fall through to balanced-slice search
  }

  // Otherwise find the first balanced object or array.
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = candidate.indexOf(open);
    if (start < 0) continue;
    const end = candidate.lastIndexOf(close);
    if (end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      // keep trying
    }
  }

  return null;
}
