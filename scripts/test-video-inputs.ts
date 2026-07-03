// Verifies analyze_video accepts all 4 input forms per the CLAUDE.md contract:
// file path, http(s) URL (skipped here), data: URI, and bare base64. Checks
// frame extraction (no model call). Run: bun run scripts/test-video-inputs.ts [file]
import { readFileSync } from "node:fs";
import { extractFrames } from "../src/video.js";

const file = process.argv[2] ?? "/tmp/vision-mcp-test.mp4";
const b64 = readFileSync(file).toString("base64");
const dataUri = `data:video/mp4;base64,${b64}`;

const cases: Array<[string, string]> = [
  ["file path", file],
  ["data: URI", dataUri],
  ["bare base64", b64],
];

for (const [label, input] of cases) {
  try {
    const frames = await extractFrames(input, { frames: 3 });
    console.log(`${label.padEnd(12)} -> ${frames.length} frame(s)`);
  } catch (err) {
    console.log(`${label.padEnd(12)} -> ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}
