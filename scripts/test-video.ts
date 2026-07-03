// Standalone live test for analyze_video: extract N frames from a video with
// ffmpeg and send them to the configured vision model. Reads config from .env.
import { loadConfig, createProvider } from "../src/config.js";
import { extractFrames } from "../src/video.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const provider = createProvider(cfg);

  const video = process.argv[2] ?? "/tmp/vision-mcp-test.mp4";
  const frames = Number(process.argv[3] ?? 8);

  console.error(`Provider: ${cfg.provider} | Model: ${cfg.model} | Base URL: ${cfg.baseURL}`);
  console.error(`Video: ${video} | frames: ${frames}`);

  const imgs = await extractFrames(video, { frames });
  console.error(`Extracted ${imgs.length} frame(s) -> analyzing...`);

  const result = await provider.analyze(
    imgs,
    "These frames are sampled evenly across a short video. Describe what the video shows, including any motion or changes over time.",
  );
  console.log(result);
}

main().catch((err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
