import { createHash, sign, verify } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { zipSync } from "fflate";

/** What the server reports about its bundle; `manifest.json` next to the zip. */
export interface BundleManifest {
  /** The commit the web build was made from. Also the bundle's id on the phone. */
  version: string;
  /** The oldest Android shell the build runs in. */
  minNative: string;
  /** SHA-256 of the zip, hex. */
  checksum: string;
  /** RSA-SHA256 signature of the zip, base64; null for an unsigned build. */
  signature: string | null;
}

export interface BundleOptions {
  /** The web build to pack; `index.html` ends up at the zip's root. */
  dist: string;
  /** Receives `bundle.zip` and `manifest.json`. */
  out: string;
  version: string;
  minNative: string;
  /** PEM. Without it the bundle is unsigned, and a released app refuses it. */
  privateKey?: string | undefined;
  /** PEM; the key the app verifies with. */
  publicKey: string;
}

function filesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/** Packs the web build for the Android app's live updates. */
export function createBundle(options: BundleOptions): BundleManifest {
  const entries: Record<string, Uint8Array> = {};
  for (const file of filesUnder(options.dist)) {
    const name = relative(options.dist, file).split(sep).join("/");
    entries[name] = readFileSync(file);
  }
  if (!entries["index.html"]) {
    throw new Error(`${options.dist} has no index.html: build the web app`);
  }
  const zip = zipSync(entries, { level: 9 });

  let signature: string | null = null;
  if (options.privateKey) {
    const bytes = sign("sha256", zip, options.privateKey);
    // A bundle signed with another key is refused by every phone, and
    // nothing else would report it.
    if (!verify("sha256", zip, options.publicKey, bytes)) {
      throw new Error(
        "The signing key doesn't match the public key in capacitor.config.ts",
      );
    }
    signature = bytes.toString("base64");
  }

  const manifest: BundleManifest = {
    version: options.version,
    minNative: options.minNative,
    checksum: createHash("sha256").update(zip).digest("hex"),
    signature,
  };
  mkdirSync(options.out, { recursive: true });
  writeFileSync(join(options.out, "bundle.zip"), zip);
  writeFileSync(
    join(options.out, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}
