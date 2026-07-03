import { loadConfig, createProvider } from "../src/config.js";
import { loadImage } from "../src/image.js";
import type { LoadedImage } from "../src/providers/types.js";

// 1x1 transparent PNG, base64.
const SAMPLE_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const provider = createProvider(cfg);

  const imageArg = process.argv[2];
  const img: LoadedImage = imageArg
    ? await loadImage(imageArg)
    : { data: SAMPLE_PNG_B64, media_type: "image/png" };

  // Diagnostics go to stderr so stdout stays clean for the result.
  console.error(`Provider: ${cfg.provider}`);
  console.error(`Model:    ${cfg.model}`);
  console.error(`Base URL: ${cfg.baseURL}`);
  console.error(`Image:    ${imageArg ?? "<inline 1x1 sample PNG>"}`);
  console.error("---");

  const result = await provider.analyze(
    [img],
    "Describe this image. If it is a tiny test image, say so.",
  );

  // Result goes to stdout.
  console.log(result);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number } | null)?.status;
  console.error(`Error: ${message}`);
  if (status !== undefined) console.error(`Status: ${status}`);
  process.exit(1);
});
