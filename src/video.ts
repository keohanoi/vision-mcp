import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { LoadedImage } from "./providers/types.js";

export interface ExtractFramesOptions {
  /** Number of evenly-spaced frames to sample. Default 8. */
  frames?: number;
  /** Hard cap on frame count. Default 16. */
  maxFrames?: number;
}

/** Run a command and capture stdout/stderr + exit code. */
async function run(
  cmd: string,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    proc.on("error", reject);
    proc.on("close", (code: number | null) => resolve({ code, stdout, stderr }));
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Get video duration in seconds via ffprobe, or null if unavailable. */
async function probeDuration(input: string): Promise<number | null> {
  const { code, stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    input,
  ]);
  if (code !== 0) return null;
  const d = parseFloat(stdout.trim());
  return Number.isFinite(d) && d > 0 ? d : null;
}

interface ResolvedInput {
  path: string;
  cleanup: () => void;
}

const noopCleanup = (): void => {};

/** Pick a file extension for a video MIME type (helps ffmpeg detect format). */
function extForMime(mime: string): string {
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("quicktime") || mime.includes("mov")) return ".mov";
  if (mime.includes("avi")) return ".avi";
  if (mime.includes("matroska") || mime.includes("mkv")) return ".mkv";
  return ".mp4";
}

function looksLikeBase64(s: string): boolean {
  return s.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0;
}

/**
 * Resolve any supported video input (file path, http(s) URL, data: URI, or
 * base64) to a path ffmpeg/ffprobe can read. Data URIs and bare base64 are
 * decoded to a temp file cleaned up by the returned `cleanup`.
 */
async function resolveVideoInput(input: string): Promise<ResolvedInput> {
  // http(s) URL: ffmpeg reads it directly.
  if (/^https?:\/\//i.test(input)) return { path: input, cleanup: noopCleanup };

  // data: URI → decode to a temp file.
  if (input.startsWith("data:")) {
    const comma = input.indexOf(",");
    if (comma < 0) throw new Error("Malformed data URI video: missing comma");
    const meta = input.slice(5, comma);
    const payload = input.slice(comma + 1);
    const isBase64 = meta.includes(";base64");
    const mime =
      meta
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.length > 0 && p !== "base64") ?? "video/mp4";
    const bytes = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    const dir = mkdtempSync(join(tmpdir(), "vision-mcp-vid-"));
    const path = join(dir, `input${extForMime(mime)}`);
    writeFileSync(path, bytes);
    return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  // Bare base64 (no scheme, not an existing file) → decode to temp.
  if (!existsSync(input) && looksLikeBase64(input)) {
    const dir = mkdtempSync(join(tmpdir(), "vision-mcp-vid-"));
    const path = join(dir, "input.mp4");
    writeFileSync(path, Buffer.from(input, "base64"));
    return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  // File path (ffmpeg surfaces a clear error if it's missing/invalid).
  return { path: input, cleanup: noopCleanup };
}

/**
 * Extract evenly-spaced frames from a video and return them as base64 PNGs.
 *
 * `video` may be a file path, http(s) URL, data: URI, or base64 string.
 * `frames` frames are sampled evenly across the duration via an ffmpeg `fps`
 * filter (falls back to 1 fps if the duration can't be probed). Requires
 * `ffmpeg` and `ffprobe` on PATH.
 */
export async function extractFrames(
  video: string,
  opts: ExtractFramesOptions = {},
): Promise<LoadedImage[]> {
  const maxFrames = opts.maxFrames ?? 16;
  let frames = Math.round(opts.frames ?? 8);
  if (!Number.isFinite(frames) || frames < 1) frames = 8;
  frames = Math.min(frames, maxFrames);

  const resolved = await resolveVideoInput(video);
  try {
    const duration = await probeDuration(resolved.path);
    // fps so that ~`frames` frames land across the whole duration; 1 fps fallback.
    const fps = duration && duration > 0 ? frames / duration : 1;

    const dir = mkdtempSync(join(tmpdir(), "vision-mcp-frames-"));
    const pattern = join(dir, "frame_%03d.png");
    try {
      const { code, stderr } = await run("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        resolved.path,
        "-vf",
        `fps=${fps}`,
        "-frames:v",
        String(frames),
        "-q:v",
        "2",
        pattern,
      ]);
      if (code !== 0) {
        throw new Error(
          `ffmpeg failed to extract frames (exit ${code}). ${truncate(stderr.trim(), 500)}`,
        );
      }

      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".png"))
        .sort();
      if (files.length === 0) {
        throw new Error(
          "ffmpeg produced no frames — is the input a video with a visual track?",
        );
      }

      return files.map((f) => ({
        data: readFileSync(join(dir, f)).toString("base64"),
        media_type: "image/png",
      }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    resolved.cleanup();
  }
}
