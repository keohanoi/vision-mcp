# vision-mcp

An [MCP](https://modelcontextprotocol.io/) server that gives a **text-only coding agent vision, using the z.ai coding plan you already have.**

The z.ai coding plan's text/coding models have **no vision** — they reject image input. But **`glm-4.6v` is a multimodal model on that same plan**, reachable at the same coding-plan endpoint (`https://api.z.ai/api/coding/paas/v4`) with the **same API key** and same billing. vision-mcp is the bridge: it accepts an image (or a video, or a cropped region) plus a prompt, forwards it to `glm-4.6v` on your plan, and returns text. It exposes **five** tools over stdio — including video analysis (ffmpeg frame extraction) and region zoom (sharp) for fine detail — to any MCP client. The default backend is **z.ai GLM-4.6V** (OpenAI Chat Completions format); an Anthropic-format provider is also supported for other gateways.

The published npm package **`@keohanoi/vision-mcp`** runs under **Node.js ≥ 18** via `npx` — no install step. For development / from-source, **[bun](https://bun.sh)** runs the TypeScript directly with no build step.

## Why

The z.ai coding plan already bundles a vision-capable model alongside its text/coding models — but the models you actually drive (and most agent defaults) are text-only and can't see images. This server routes image/OCR/video calls to `glm-4.6v` on your **same plan, same API key, same billing** — no separate vision subscription and no second account.

Use it whenever your coding agent needs to:

- Read a **screenshot** or UI mock
- **OCR** an error message, stack trace, log, or config from an image
- **Compare** two UI states (before/after, diffs)
- **Summarize a video** by sampled frames

Works with any MCP client — Claude Code, OpenCode, and anything else that speaks MCP over stdio.

## Prerequisites

- **[Node.js](https://nodejs.org/) ≥ 18** — required to run the published package via `npx`
- [ffmpeg](https://ffmpeg.org/) + `ffprobe` on PATH — only required for the `analyze_video` tool

**For from-source / development** (see [From source (development)](#from-source-development) below): [bun](https://bun.sh), and `sharp` (installed automatically by `bun install`; used by `analyze_image` / `extract_text` / `analyze_region` for crop, resize, and format control).

## Install

No install step is needed for normal use — `npx` fetches `@keohanoi/vision-mcp` on first run. See [Quick start (published package)](#quick-start-published-package) below.

For development / running from source, see [From source (development)](#from-source-development) and run `bun install` in the repo.

## Configure

Copy `.env.example` to `.env` and fill in the values for the provider you want to use.

```bash
cp .env.example .env
```

## Quick start (published package)

The published npm package **`@keohanoi/vision-mcp`** is the primary install/config path. It runs under Node via `npx` — no clone, no build.

### Prerequisites

- **Node.js ≥ 18** (npx runs the package under Node)
- **ffmpeg/ffprobe on PATH** — only required if using the `analyze_video` tool

### Configure

Add the server to your MCP client config (e.g. Claude Code's `mcpServers`, OpenCode, etc.):

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["-y", "@keohanoi/vision-mcp"],
      "env": {
        "VISION_PROVIDER": "openai",
        "VISION_BASE_URL": "https://api.z.ai/api/coding/paas/v4",
        "VISION_API_KEY": "your-z.ai-coding-plan-key",
        "VISION_MODEL": "glm-4.6v"
      }
    }
  }
}
```

CLI alternative (the `VISION_*` env vars must be exported in your shell first when using this form):

```bash
claude mcp add vision -- npx -y @keohanoi/vision-mcp
```

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VISION_PROVIDER` | no | `openai` | `anthropic` (→ `/v1/messages`) or `openai` (→ `{base}/chat/completions`). Defaults to `openai` (z.ai) |
| `VISION_BASE_URL` | no (openai) / yes (anthropic) | `https://api.z.ai/api/coding/paas/v4` *(when provider=openai)* | **Recommended.** Collision-safe alias; takes precedence over the provider-specific var below |
| `VISION_API_KEY` | yes | — | **Recommended.** Collision-safe alias for the API key |
| `VISION_MODEL` | no (openai) / yes (anthropic) | `glm-4.6v` *(when provider=openai)* | **Recommended.** Collision-safe alias; **must be a multimodal/vision model.** On the z.ai coding plan: **`glm-4.6v`** (default), also `glm-4.5v` and `glm-4.6v-flash` |
| `VISION_THINKING` | no | `disabled` | `enabled` \| `disabled` — controls GLM thinking mode. Default `disabled` for fast/cheap perception & OCR |
| `ANTHROPIC_BASE_URL` | anthropic | — | Anthropic-format endpoint (no `/v1`; the SDK appends paths). Used only if `VISION_BASE_URL` is unset |
| `ANTHROPIC_API_KEY` | anthropic | — | API key. Used only if `VISION_API_KEY` is unset |
| `ANTHROPIC_MODEL` | anthropic | — | **Must be a multimodal/vision model.** Used only if `VISION_MODEL` is unset |
| `OPENAI_BASE_URL` | openai | — | OpenAI-format endpoint. Does **not** have to end in `/v1` (z.ai ends in `/v4`). Used only if `VISION_BASE_URL` is unset |
| `OPENAI_API_KEY` | openai | — | API key. Used only if `VISION_API_KEY` is unset |
| `OPENAI_MODEL` | openai | — | **Must be a multimodal/vision model.** Used only if `VISION_MODEL` is unset |
| `VISION_MAX_TOKENS` | no | `1024` | Max output tokens per request |
| `VISION_TIMEOUT_MS` | no | `60000` | Request timeout in ms |

> **Why `VISION_*` aliases?** bun's `.env` loader does **not** override variables already present in the process environment. If a host already exports `ANTHROPIC_*` (e.g. a coding agent's own credentials, as Claude Code does), those inherited values silently shadow your config. The `VISION_*` names never collide, so prefer them in `mcpServers` `env` blocks and in `.env`.

## From source (development)

For development, or if you prefer to run from a clone, **[bun](https://bun.sh)** runs the TypeScript directly with no build step. After cloning:

```bash
bun install
```

Then configure your MCP client to run the server from source.

### Run as an MCP server — z.ai GLM-4.6V (default)

```json
{
  "mcpServers": {
    "vision": {
      "command": "bun",
      "args": ["run", "/ABS/PATH/vision-mcp/src/index.ts"],
      "env": {
        "VISION_PROVIDER": "openai",
        "VISION_BASE_URL": "https://api.z.ai/api/coding/paas/v4",
        "VISION_API_KEY": "your-z.ai-coding-plan-key",
        "VISION_MODEL": "glm-4.6v",
        "VISION_THINKING": "disabled",
        "VISION_MAX_TOKENS": "1024",
        "VISION_TIMEOUT_MS": "60000"
      }
    }
  }
}
```

### Alternative: OpenCode Go / Anthropic

```json
{
  "mcpServers": {
    "vision": {
      "command": "bun",
      "args": ["run", "/ABS/PATH/vision-mcp/src/index.ts"],
      "env": {
        "VISION_PROVIDER": "anthropic",
        "VISION_BASE_URL": "https://opencode.ai/zen/go",
        "VISION_API_KEY": "your-key",
        "VISION_MODEL": "minimax-m3",
        "VISION_MAX_TOKENS": "1024",
        "VISION_TIMEOUT_MS": "60000"
      }
    }
  }
}
```

> On OpenCode Go, MiniMax M3 / Qwen3.7 are served at `/v1/messages` (Anthropic format, `minimax-m3`); GLM / Kimi / DeepSeek / MiMo are at `/v1/chat/completions` (OpenAI format). The Go coding models are code-optimized — verify a model is multimodal before relying on it for images. **`[1m]` is not part of any model id** — it's a CLI-only suffix and is rejected by the API. The free **Zen** tier (`https://opencode.ai/zen/v1`) routes differently from the Go subscription.

## Standalone live test

> Dev / from-source utility — this script is run from a clone with bun.

`scripts/test-vision.ts` runs a single end-to-end call against your configured provider (bun auto-loads `.env` from the cwd). It sends your API key to your configured endpoint — that is the point.

```bash
# Uses an inline 1x1 PNG:
bun run scripts/test-vision.ts

# Or pass any image (path/URL/data-uri/base64):
bun run scripts/test-vision.ts ./photo.jpg
```

## Tools

- **`analyze_image`** — Describe or answer a question about a single image.
  - `image` (string, required): file path, http(s) URL, `data:` URI, or base64
  - `prompt` (string, optional): structured default (summary → subjects / quoted text / colors / layout)
  - `format` (`"auto"|"png"|"jpeg"|"webp"`, optional): `png` is lossless — best for text/diagrams
  - `max_dimension` (number, optional): downscale longest side ≤ N px (cost control)
  - `min_dimension` (number, optional): upscale longest side ≥ N px (legibility for small images)
- **`compare_images`** — Compare 2–4 images (structured similarity/differences default).
  - `images` (string[], required, 2–4): same input forms as above
  - `prompt` (string, optional)
- **`extract_text`** — OCR a single image. Always re-encodes to **lossless PNG** first (JPEG artifacts wreck OCR); the prompt enforces reading order and exact quoting.
  - `image` (string, required)
  - `output_format` (`"plain" | "markdown" | "json"`, optional, default `plain`)
- **`analyze_region`** — Zoom into part of an image for fine detail (small text, dense diagrams, tiny UI). Crops + upscales via sharp.
  - `image` (string, required)
  - `region` (`{x,y,width,height}` in normalized 0–1, optional): zoom exactly this box. **Omit for auto-detect** of up to 4 regions of interest.
  - `prompt`, `zoom` (1–8, default 2), `format`, `max_dimension` (all optional)
- **`analyze_video`** — Summarize a video by sampling evenly-spaced frames with ffmpeg and sending them to the model as images.
  - `video` (string, required): file path, http(s) URL, `data:` URI, or base64
  - `frames` (number, optional, 1–16, default 8): evenly-spaced frames to sample
  - `prompt` (string, optional): default asks for a description of content and motion over time

### Improving vision quality

These tools exist to make the model actually *see* better, not just forward pixels:

- **`analyze_region` is the big one.** The model normalizes images to ~1568px, so fine text that occupies a small fraction of a large image gets downscaled past readability and garbled (e.g. `1Z`→`12`, `q3-vl`→`q3-v1`, `MZ9K`→`M29K`). Cropping tightly around the text so it fills more of the frame restores legibility. Verified by A/B: a full-image read of a dense narrow-column receipt misread 5+ tokens; the zoomed `analyze_region` read them all correctly.
- **`extract_text` forces lossless PNG**, and **`analyze_image` exposes `format` / `max_dimension` / `min_dimension`**, for the same reason — don't let JPEG artifacts or over-downscaling destroy text.

## Caveats

- **Default provider is now `openai` (z.ai).** Previously `anthropic` — if you relied on the old default, set `VISION_PROVIDER=anthropic` explicitly.
- **GLM-4.6V accepts jpg/png/jpeg only** (not webp/gif). The default tool paths emit PNG, so they're safe; an explicit `format: "webp"` on `analyze_image` / `analyze_region` is rejected by z.ai.
- **`VISION_THINKING` defaults to `disabled`** for speed/cost on perception calls; set `enabled` for harder reasoning.
- **Don't rely on `ANTHROPIC_*` in a host that already exports them.** bun's `.env` does not override inherited process env, so a coding agent's own `ANTHROPIC_*` will shadow your config. Use the `VISION_*` aliases in `.env` and in `mcpServers` `env`.
- **API keys stay in `.env`.** `.env` is gitignored — never commit it.
- **Video is frame-extraction, not native input.** The provider endpoints accept only still images — `analyze_video` samples N evenly-spaced frames via ffmpeg and sends them as image blocks, so it captures motion but not audio or sub-frame detail; cost/latency scale with frame count (capped at 16). (z.ai also offers native video/file inputs we don't use — out of scope.)

### Alternative-provider caveats (OpenCode Go / Anthropic)

These apply only when routing through OpenCode Go instead of the z.ai default:

- **`[1m]` is not part of the model id.** opencode's CLI prints `minimax-m3[1m]` to denote a 1M-context variant, but the API `model` field takes the bare id **`minimax-m3`**. Sending `[1m]` → `Model … is not supported`.
- **OpenCode Go vs. Zen routing.** A Go subscription's base URL is always `https://opencode.ai/zen/go`. The separate free **Zen** tier (`https://opencode.ai/zen/v1`) routes differently.
- **`minimax-m3` is multimodal and verified working** for image analysis on Go — and cheap ($0.30 in / $1.20 out per 1M tokens).

## Verified

End-to-end **green-path** test against **z.ai** with **`glm-4.6v`** (OpenAI provider, config read straight from `.env` — only `VISION_API_KEY` required beyond baked defaults). Fetched a real image from a URL and the model read its text — confirming the full pipeline: baked defaults → image fetch → base64 → z.ai Bearer auth → OpenAI Chat Completions response parsing (effectively OCR-grade vision).

```
$ bun run scripts/test-vision.ts 'https://placehold.co/600x400/png'
Provider: openai | Model: glm-4.6v | Base URL: https://api.z.ai/api/coding/paas/v4
→ 'This is a tiny test image (placeholder image). It displays a plain light gray
   background with the text "600 × 400" centered in a medium gray, sans-serif font…'
```

> Note: z.ai rejects the inline 1×1 transparent PNG used by the no-argument form of `scripts/test-vision.ts` with HTTP 400 / error code 1210 ("image input format/parse error") — it dislikes degenerate/blank images, not the request shape. Pass a real image (URL/path) to verify the pipeline.

Reproduce with any image (local path, URL, data-URI, or base64):

```bash
bun run scripts/test-vision.ts ./photo.jpg
```
