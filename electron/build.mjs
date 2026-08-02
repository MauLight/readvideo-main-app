import { build } from "esbuild";
import { rm } from "node:fs/promises";

/**
 * Bundles main and preload into dist/.
 *
 * Why bundle rather than just emit with tsc: main imports the runners from the
 * back-end workspace, which resolves through a symlink. A packager copying
 * node_modules would either break that link or drag the whole backend tree —
 * devDependencies and .env included — into the shipped app. esbuild resolves
 * the import at build time and inlines only what's reached, so the packaged
 * app carries no symlink and needs no runtime node_modules.
 *
 * Type checking is a separate step (`npm run typecheck`); esbuild only strips
 * types.
 */

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  // Electron's own module is supplied by the runtime, never bundled.
  external: ["electron"],
  // Matches the Node version Electron 43 embeds.
  target: "node22",
  sourcemap: true,
  logLevel: "info",
};

await rm("dist", { recursive: true, force: true });

await build({
  ...common,
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
});

// Preload runs in a sandboxed context, which requires CommonJS — hence the
// shared `format` above rather than ESM.
await build({
  ...common,
  entryPoints: ["src/preload.ts"],
  outfile: "dist/preload.js",
});
