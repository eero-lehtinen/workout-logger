import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCommit, MIN_NATIVE } from "../build-info.ts";
import { LIVE_UPDATE_PUBLIC_KEY } from "../capacitor.config.ts";
import { createBundle } from "./live-bundle.ts";

// Runs after `vite build`: packs dist into live-bundle/, which the server
// hands to the Android app (docs/deployment.md#live-updates).
const dist = fileURLToPath(new URL("../dist", import.meta.url));
const out = fileURLToPath(new URL("../live-bundle", import.meta.url));

rmSync(out, { recursive: true, force: true });
// The image build copies the directory even when it stays empty.
mkdirSync(out, { recursive: true });

const version = buildCommit();
if (!version) {
  console.warn("No commit is known, so no live-update bundle is built.");
} else {
  const manifest = createBundle({
    dist,
    out,
    version,
    minNative: MIN_NATIVE,
    privateKey: process.env.LIVE_UPDATE_PRIVATE_KEY || undefined,
    publicKey: LIVE_UPDATE_PUBLIC_KEY,
  });
  console.log(
    `Live-update bundle ${manifest.version} (${manifest.signature ? "signed" : "unsigned"}), for shells from ${manifest.minNative}`,
  );
}
