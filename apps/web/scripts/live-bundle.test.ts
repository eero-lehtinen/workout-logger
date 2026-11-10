import { createHash, generateKeyPairSync, verify } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import { createBundle } from "./live-bundle.ts";

const root = mkdtempSync(join(tmpdir(), "wl-bundle-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const dist = join(root, "dist");
mkdirSync(join(dist, "assets"), { recursive: true });
writeFileSync(join(dist, "index.html"), "<!doctype html><title>app</title>");
writeFileSync(join(dist, "assets", "index-abc.js"), "console.log(1);");

function keyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}
const keys = keyPair();

const options = {
  dist,
  version: "0123abc",
  minNative: "1.2.0",
  publicKey: keys.publicKey,
};

describe("createBundle", () => {
  it("packs the web build with index.html at the root", () => {
    const out = join(root, "plain");
    const manifest = createBundle({ ...options, out });
    const zip = readFileSync(join(out, "bundle.zip"));
    expect(Object.keys(unzipSync(zip)).sort()).toEqual([
      "assets/index-abc.js",
      "index.html",
    ]);
    expect(manifest).toEqual({
      version: "0123abc",
      minNative: "1.2.0",
      checksum: createHash("sha256").update(zip).digest("hex"),
      signature: null,
    });
    expect(
      JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")),
    ).toEqual(manifest);
  });

  it("signs the zip so that the app's public key verifies it", () => {
    const out = join(root, "signed");
    const manifest = createBundle({
      ...options,
      out,
      privateKey: keys.privateKey,
    });
    const zip = readFileSync(join(out, "bundle.zip"));
    expect(
      verify(
        "sha256",
        zip,
        keys.publicKey,
        Buffer.from(manifest.signature ?? "", "base64"),
      ),
    ).toBe(true);
  });

  it("refuses a signing key that isn't the app's", () => {
    expect(() =>
      createBundle({
        ...options,
        out: join(root, "wrong-key"),
        privateKey: keyPair().privateKey,
      }),
    ).toThrow("doesn't match");
  });

  it("refuses a directory without a web build", () => {
    const empty = join(root, "empty");
    mkdirSync(empty);
    expect(() =>
      createBundle({ ...options, dist: empty, out: join(root, "none") }),
    ).toThrow("index.html");
  });
});
