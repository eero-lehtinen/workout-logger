import { build } from "esbuild";

// Node doesn't strip types under node_modules, where `pnpm deploy` puts the
// workspace packages, so the image runs a bundle (docs/deployment.md).
// better-sqlite3 is a native module and stays an installed dependency.
await build({
  entryPoints: ["src/main.ts", "src/cli.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  external: ["better-sqlite3"],
  // Bundled CommonJS code calls require().
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "warning",
});
