// Bundles src/index.ts into a single Node-runnable ESM file at dist/index.js,
// externalizes `sharp` (native — installed as a normal dep by consumers), and
// prepends the `#!/usr/bin/env node` shebang so the file works as an npm bin / via npx.
// Build tool is Bun (dev); the OUTPUT runs under Node (published artifact).
import { execSync } from "node:child_process";
import { readFile, writeFile, chmod } from "node:fs/promises";

const OUTFILE = "dist/index.js";

console.log("→ bundling src/index.ts → dist/index.js (target=node, external=sharp)");
execSync("bun build src/index.ts --target=node --external=sharp --outfile dist/index.js", {
  stdio: "inherit",
});

// bun build doesn't add a shebang for non-compiled bundles — prepend one.
const bundled = await readFile(OUTFILE, "utf8");
if (!bundled.startsWith("#!")) {
  await writeFile(OUTFILE, `#!/usr/bin/env node\n${bundled}`);
}
await chmod(OUTFILE, 0o755);
console.log(`✓ built ${OUTFILE} (shebang + executable)`);
