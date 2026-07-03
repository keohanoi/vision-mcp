import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { extractJson } from "./json.js";
import { loadImage } from "./image.js";
import { preprocessImage, type Region } from "./preprocess.js";
import type { VisionProvider } from "./providers/types.js";
import { extractFrames } from "./video.js";

/** Build an OCR prompt that matches the requested output format. */
function ocrPrompt(format: "plain" | "markdown" | "json"): string {
  const base =
    "Read all visible text in this image. Read top-to-bottom, left-to-right; preserve columns, tables, lists, and reading order; and quote text exactly as shown (including case and punctuation). If there is no readable text, reply with: NO_TEXT_FOUND.";
  switch (format) {
    case "plain":
      return `${base} Return only the extracted text.`;
    case "markdown":
      return `${base} Return the text as Markdown that preserves headings, lists, and table structure.`;
    case "json":
      return `${base} Return ONLY valid JSON with this shape: {"text": "..."}. No prose, no code fences.`;
  }
}

/** Wrap a handler so thrown errors become structured tool-error results. */
function toToolResult(fn: () => Promise<string>): Promise<CallToolResult> {
  return fn()
    .then((text): CallToolResult => ({ content: [{ type: "text", text }] }))
    .catch((err: unknown): CallToolResult => {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    });
}

/**
 * Register the five vision tools on an MCP server.
 * Failures inside handlers surface as `isError` results rather than crashing.
 */
export function registerTools(server: McpServer, provider: VisionProvider): void {
  // 1. analyze_image
  server.registerTool(
    "analyze_image",
    {
      description:
        "Default tool for any single image or screenshot. Describes content, answers questions, and identifies UI, apps, and text. Use this unless you need verbatim OCR (extract_text), image comparison (compare_images), fine-detail zoom (analyze_region), or video (analyze_video). Input: file path, http(s) URL, data: URI, or base64.",
      inputSchema: z.object({
        image: z
          .string()
          .describe("Image as a file path, http(s) URL, data: URI, or base64 string"),
        prompt: z.string().optional().describe("What to ask about the image"),
        format: z
          .enum(["auto", "png", "jpeg", "webp"])
          .optional()
          .describe("Output format. 'png' is lossless — best for text/diagrams. Default keeps source."),
        max_dimension: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Downscale longest side to ≤ this many px (cost control)"),
        min_dimension: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Upscale longest side to ≥ this many px (legibility for small images)"),
      }),
    },
    async (args) => {
      const prompt =
        args.prompt ??
        "Describe this image thoroughly. Start with a one-sentence summary, then cover: main subjects, any text (quote it exactly), colors, layout/spatial arrangement, and anything notable or unusual.";
      return toToolResult(async () => {
        const img = await loadImage(args.image);
        const prepared = await preprocessImage(img, {
          format: args.format,
          maxDimension: args.max_dimension,
          minDimension: args.min_dimension,
        });
        return provider.analyze([prepared], prompt);
      });
    },
  );

  // 2. compare_images
  server.registerTool(
    "compare_images",
    {
      description:
        "Compare 2–4 images: before/after, diffs, 'what changed', or spotting differences. Each image is a file path, http(s) URL, data: URI, or base64.",
      inputSchema: z.object({
        images: z
          .array(z.string())
          .min(2)
          .max(4)
          .describe("2–4 images (path/URL/data-uri/base64)"),
        prompt: z.string().optional().describe("What to ask about the images"),
      }),
    },
    async (args) => {
      const prompt =
        args.prompt ??
        "Compare these images. Describe the overall similarity, then list concrete differences and notable changes (objects added/removed/moved, text, colors, layout). Be specific.";
      return toToolResult(async () => {
        const imgs = await Promise.all(args.images.map((p) => loadImage(p)));
        return provider.analyze(imgs, prompt);
      });
    },
  );

  // 3. extract_text (OCR)
  server.registerTool(
    "extract_text",
    {
      description:
        "Verbatim OCR — returns exact text, not a paraphrase. Use for error messages, stack traces, code, config, logs, and console output where transcription accuracy matters. Re-encodes to lossless PNG first. Output formats: plain, markdown, json. Input: file path, http(s) URL, data: URI, or base64.",
      inputSchema: z.object({
        image: z
          .string()
          .describe("Image as a file path, http(s) URL, data: URI, or base64 string"),
        output_format: z
          .enum(["plain", "markdown", "json"])
          .optional()
          .describe("Output format for extracted text (default: plain)"),
      }),
    },
    async (args) => {
      const format = args.output_format ?? "plain";
      return toToolResult(async () => {
        // Lossless PNG re-encode: JPEG artifacts wreck OCR of fine text.
        const img = await preprocessImage(await loadImage(args.image), { format: "png" });
        return provider.analyze([img], ocrPrompt(format));
      });
    },
  );

  // 4. analyze_region (crop + upscale — explicit or auto-detected regions)
  server.registerTool(
    "analyze_region",
    {
      description:
        "Zoom into part of an image for fine detail (small text, dense diagrams, tiny UI) that's illegible at full resolution. If 'region' is given (normalized 0–1 box {x,y,width,height}), crops and upscales exactly that area; if omitted, auto-detects up to 4 regions of interest and zooms each. Uses sharp. Input: file path, http(s) URL, data: URI, or base64.",
      inputSchema: z.object({
        image: z
          .string()
          .describe("Image as a file path, http(s) URL, data: URI, or base64 string"),
        region: z
          .object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            width: z.number().min(0).max(1),
            height: z.number().min(0).max(1),
          })
          .optional()
          .describe("Bounding box in normalized 0–1 coords (top-left origin). Omit for auto-detect."),
        prompt: z.string().optional().describe("What to ask about the region(s)"),
        zoom: z
          .number()
          .int()
          .min(1)
          .max(8)
          .optional()
          .describe("Upscale factor for the crop (default 2, max 8)"),
        format: z
          .enum(["auto", "png", "jpeg", "webp"])
          .optional()
          .describe("Output format for the crop. 'png' is lossless (good for text)."),
        max_dimension: z.number().int().positive().optional(),
      }),
    },
    async (args) => {
      const prompt =
        args.prompt ??
        "Describe this region in detail. Quote any text exactly, and note colors, layout, and small objects.";
      const zoom = args.zoom ?? 2;
      return toToolResult(async () => {
        const base = await loadImage(args.image);

        // Explicit: crop + upscale + analyze in one call.
        if (args.region) {
          const crop = await preprocessImage(base, {
            region: args.region,
            zoom,
            format: args.format,
            maxDimension: args.max_dimension,
          });
          return provider.analyze([crop], prompt);
        }

        // Auto: ask the model for regions of interest, then zoom each.
        const detectPrompt =
          "Look at this image and identify up to 4 regions that contain important fine detail " +
          "(small text, charts, diagrams, tiny objects). Respond with ONLY JSON, no prose, in this shape: " +
          '{"regions":[{"label":"short name","region":{"x":0.0,"y":0.0,"width":0.0,"height":0.0}}]}. ' +
          "Coordinates are normalized 0–1 with the top-left origin. If nothing is worth zooming, return {\"regions\":[]}.";
        const detection = await provider.analyze([base], detectPrompt);
        const parsed = extractJson<{ regions?: Array<{ label?: string; region?: Region }> }>(detection);
        const regions = (parsed?.regions ?? [])
          .filter((r): r is { label?: string; region: Region } => !!r.region)
          .slice(0, 4);

        if (regions.length === 0) {
          const full = await provider.analyze(
            [
              await preprocessImage(base, {
                format: args.format,
                maxDimension: args.max_dimension,
              }),
            ],
            prompt,
          );
          return `No specific regions detected. Full-image analysis:\n${full}`;
        }

        const parts: string[] = [];
        for (const r of regions) {
          const crop = await preprocessImage(base, {
            region: r.region,
            zoom,
            format: args.format,
            maxDimension: args.max_dimension,
          });
          const detail = await provider.analyze([crop], `Region "${r.label ?? ""}". ${prompt}`);
          parts.push(`### ${r.label ?? "region"}\n${detail}`);
        }
        return parts.join("\n\n");
      });
    },
  );

  // 5. analyze_video (frame extraction via ffmpeg)
  server.registerTool(
    "analyze_video",
    {
      description:
        "Summarize a video by sampling evenly-spaced frames (ffmpeg) and describing its content and any motion over time. Input: file path, http(s) URL, data: URI, or base64. Requires ffmpeg/ffprobe on PATH.",
      inputSchema: z.object({
        video: z.string().describe("Video as a file path or http(s) URL"),
        frames: z
          .number()
          .int()
          .min(1)
          .max(16)
          .optional()
          .describe("Number of evenly-spaced frames to sample (default 8, max 16)"),
        prompt: z.string().optional().describe("What to ask about the video"),
      }),
    },
    async (args) => {
      const prompt =
        args.prompt ??
        "These frames are sampled evenly across a video. Describe what happens in the video over time.";
      return toToolResult(async () => {
        const imgs = await extractFrames(args.video, { frames: args.frames });
        if (imgs.length === 0) throw new Error("No frames could be extracted from the video.");
        return provider.analyze(imgs, prompt);
      });
    },
  );
}
