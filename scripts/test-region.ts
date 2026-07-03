// A/B proof that region zoom improves fine-detail reading. Loads a tiny-text
// image, reads it at full resolution, then crops+upscales the text band and
// reads again. Prints both for comparison. Reads config from .env.
import { loadConfig, createProvider } from "../src/config.js";
import { loadImage } from "../src/image.js";
import { preprocessImage } from "../src/preprocess.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const provider = createProvider(cfg);
  const image = process.argv[2] ?? "/tmp/vision-tinytext.png";
  const img = await loadImage(image);

  console.error(`Provider: ${cfg.provider} | Model: ${cfg.model}`);
  console.error(`Image: ${image}`);

  const READ = "Read all the text in this image exactly, line by line. Return only the text.";

  console.error("--- FULL IMAGE (no zoom) ---");
  const full = await provider.analyze([img], READ);
  console.log("FULL:\n" + full);

  console.error("--- ZOOMED REGION (text column, 2x, lossless png) ---");
  const zoomed = await preprocessImage(img, {
    region: { x: 0, y: 0.03, width: 0.24, height: 0.94 },
    zoom: 2,
    format: "png",
  });
  const detail = await provider.analyze([zoomed], READ);
  console.log("\nZOOMED:\n" + detail);
}

main().catch((err: unknown) => {
  console.error("Error: " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
