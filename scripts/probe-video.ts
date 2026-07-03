// Empirical probe: does the configured Anthropic-format endpoint accept VIDEO?
// Tries the plausible content-block shapes and reports the raw gateway response
// for each. Reads config from .env via the same VISION_* vars (no inline key).
import { readFileSync } from "node:fs";

const baseURL = (process.env.VISION_BASE_URL ?? "").replace(/\/+$/, "");
const apiKey = process.env.VISION_API_KEY ?? "";
const model = process.env.VISION_MODEL ?? "";
const videoPath = process.argv[2] ?? "/tmp/vision-mcp-test.mp4";

if (!baseURL || !apiKey || !model) {
  console.error("Set VISION_BASE_URL / VISION_API_KEY / VISION_MODEL (in .env).");
  process.exit(1);
}

const data = readFileSync(videoPath).toString("base64");
const mediaType = "video/mp4";
const url = `${baseURL}/v1/messages`;

interface Attempt {
  name: string;
  block: Record<string, unknown>;
}

const attempts: Attempt[] = [
  {
    name: "A) Anthropic 'video' block (base64 source)",
    block: { type: "video", source: { type: "base64", media_type: mediaType, data } },
  },
  {
    name: "B) 'image' block with video media_type",
    block: { type: "image", source: { type: "base64", media_type: mediaType, data } },
  },
  {
    name: "C) 'video' block with URL-style source (type:url)",
    block: { type: "video", source: { type: "url", url: "file://" + videoPath } },
  },
];

async function probe(a: Attempt): Promise<void> {
  const body = {
    model,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: [a.block, { type: "text", text: "What do you see in this video? Describe it." }],
      },
    ],
  };

  console.error(`\n=== ${a.name} ===`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    console.error(`HTTP ${res.status} ${res.statusText}`);
    console.error(text.slice(0, 800));
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

for (const a of attempts) await probe(a);
console.error("\nDone.");
