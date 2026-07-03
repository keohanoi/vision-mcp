import { readFile, stat } from "node:fs/promises";
import type { LoadedImage, LoadImageOptions } from "./providers/types.js";

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a byte array to a base64 string.
 *
 * Processes the input in 0x8000-byte chunks so that `String.fromCharCode` is
 * never called with more arguments than the JS call stack can handle (large
 * images would otherwise throw "Maximum call stack size exceeded").
 */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // 32768 — safe under V8/JSC argument limits
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Infer an image MIME type from a filename/URL extension.
 * Returns "image/png" for unknown extensions.
 */
export function mediaTypeFromExt(path: string): string {
  const clean = path.toLowerCase().split("?")[0]!.split("#")[0]!;
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".webp")) return "image/webp";
  return "image/png";
}

/** True when `s` is plausibly bare base64 (no scheme, only base64 alphabet). */
function looksLikeBase64(s: string): boolean {
  if (s.length === 0) return false;
  // Base64 (standard) alphabet + padding. Length must be a multiple of 4.
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0;
}

/** Fetch a remote URL and return it as a {@link LoadedImage}. */
async function loadFromUrl(
  url: string,
  opts: LoadImageOptions | undefined,
): Promise<LoadedImage> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch image: HTTP ${res.status} ${res.statusText}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type");
  const media_type = contentType
    ? contentType.split(";")[0]!.trim()
    : opts?.mediaType ?? "image/png";
  return { data: toBase64(buf), media_type };
}

/** Parse a `data:<mime>;base64,<payload>` (or non-base64) URI. */
function parseDataUri(uri: string, opts: LoadImageOptions | undefined): LoadedImage {
  // Format: data:[<mediatype>][;base64],<data>
  const comma = uri.indexOf(",");
  if (comma < 0) {
    throw new Error("Malformed data URI: missing comma");
  }
  const meta = uri.slice(5, comma); // strip leading "data:"
  const payload = uri.slice(comma + 1);
  const isBase64 = meta.includes(";base64");
  const media_type =
    meta
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.length > 0 && p !== "base64") ??
    opts?.mediaType ??
    "image/png";

  if (isBase64) {
    return { data: payload, media_type };
  }
  // Non-base64 data URI: URL-decode then re-encode to base64.
  const decoded = decodeURIComponent(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return { data: toBase64(bytes), media_type };
}

/** Read a file from the local filesystem. */
async function loadFromPath(
  path: string,
  opts: LoadImageOptions | undefined,
): Promise<LoadedImage> {
  if (!(await pathExists(path))) {
    throw new Error(`Image file not found: ${path}`);
  }
  const buf = new Uint8Array(await readFile(path));
  const media_type = opts?.mediaType ?? mediaTypeFromExt(path);
  return { data: toBase64(buf), media_type };
}

/**
 * Load an image from any supported input and normalize it to
 * `{ data, media_type }` where `data` is raw base64.
 *
 * Accepted inputs (checked in this order):
 *  1. `http://` / `https://` URL → fetched via `fetch`
 *  2. `data:` URI → parsed (base64 or raw)
 *  3. Existing filesystem path → read via `node:fs/promises`
 *  4. Bare base64 string → used as-is
 *
 * Detection is conservative: a path branch is preferred over the bare-base64
 * branch whenever a file actually exists at that path.
 */
export async function loadImage(
  input: string,
  opts?: LoadImageOptions,
): Promise<LoadedImage> {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return loadFromUrl(input, opts);
  }
  if (input.startsWith("data:")) {
    return parseDataUri(input, opts);
  }

  // Prefer the filesystem branch if a real file exists here.
  if (!input.includes("/") && !input.includes("\\")) {
    // Likely not a path (no separators) — still double check existence cheaply.
    if (await pathExists(input)) {
      return loadFromPath(input, opts);
    }
  } else {
    if (await pathExists(input)) {
      return loadFromPath(input, opts);
    }
  }

  if (looksLikeBase64(input)) {
    return { data: input, media_type: opts?.mediaType ?? "image/png" };
  }

  // Fall back to treating it as a (missing) path so the error is actionable.
  throw new Error(`Image not found and input is not a URL, data URI, or base64: ${input}`);
}
