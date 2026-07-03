import sharp from "sharp";
import type { LoadedImage } from "./providers/types.js";

export type ImageFormat = "auto" | "png" | "jpeg" | "webp";

/** Bounding box in normalized 0–1 coordinates (top-left origin). */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreprocessOptions {
  /** Crop to this normalized region before any other op. */
  region?: Region;
  /** Upscale factor applied to a crop (default 2 when a region is given). */
  zoom?: number;
  /** Output format. "auto" keeps/normalizes the source. */
  format?: ImageFormat;
  /** Downscale so the longest side is ≤ this (cost control). */
  maxDimension?: number;
  /** Upscale so the longest side is ≥ this (legibility for small images). */
  minDimension?: number;
}

const FORMAT_MIME: Record<"png" | "jpeg" | "webp", string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function formatFromMime(mime: string): "png" | "jpeg" | "webp" {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("webp")) return "webp";
  return "png"; // png for png/gif/unknown (lossless, model-friendly)
}

/**
 * Preprocess an image (crop/zoom/resize/reformat) before sending it to the
 * model — the core of region-zoom and resolution/format control. Returns the
 * input unchanged when no option requires work.
 */
export async function preprocessImage(
  img: LoadedImage,
  opts: PreprocessOptions = {},
): Promise<LoadedImage> {
  const wantsCrop = !!opts.region;
  const wantsZoom = !!(opts.region && (opts.zoom ?? 2) > 1);
  const wantsMax = !!(opts.maxDimension && opts.maxDimension > 0);
  const wantsMin = !!(opts.minDimension && opts.minDimension > 0);
  const wantsFormat = !!opts.format && opts.format !== "auto";
  if (!wantsCrop && !wantsMax && !wantsMin && !wantsFormat) return img;

  const input = Buffer.from(img.data, "base64");
  let pipeline = sharp(input);

  // 1) Region crop (normalized 0–1 → pixels), then optional upscale.
  if (opts.region) {
    const meta = await sharp(input).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (W > 0 && H > 0) {
      const left = Math.round(clamp01(opts.region.x) * W);
      const top = Math.round(clamp01(opts.region.y) * H);
      const cropW = Math.max(1, Math.min(W - left, Math.round(clamp01(opts.region.width) * W)));
      const cropH = Math.max(1, Math.min(H - top, Math.round(clamp01(opts.region.height) * H)));
      pipeline = sharp(input).extract({ left, top, width: cropW, height: cropH });
      const zoom = opts.zoom && opts.zoom > 1 ? opts.zoom : 1;
      if (zoom > 1) {
        pipeline = pipeline.resize(Math.round(cropW * zoom), Math.round(cropH * zoom));
      }
    }
  }

  // 2) Dimension clamps on the longest side.
  if (wantsMax) {
    pipeline = pipeline.resize({
      width: opts.maxDimension!,
      height: opts.maxDimension!,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  if (wantsMin) {
    pipeline = pipeline.resize({
      width: opts.minDimension!,
      height: opts.minDimension!,
      fit: "inside",
      withoutReduction: true,
    });
  }

  // 3) Format (re-encode).
  const fmt =
    opts.format && opts.format !== "auto" ? opts.format : formatFromMime(img.media_type);
  const out = await pipeline.toFormat(fmt).toBuffer();
  return { data: out.toString("base64"), media_type: FORMAT_MIME[fmt] };
}
