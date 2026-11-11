import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { newEpoch } from "@workout-logger/core/sync-server";
import Database from "better-sqlite3";
import type { Auth } from "./auth/auth.ts";
import { unpackCopy } from "./backup/db-copy.ts";
import { readConfig } from "./config.ts";
import { syncDb } from "./db/database.ts";
import { openServer } from "./startup.ts";

const USAGE = `Usage: server <command>

  create-owner --email <email> [--name <name>]
      Creates the owner account. Signing in with GitHub links to it when
      GitHub email is <email>: the public profile email, or the primary one if
      the profile has none. Refuses if an owner exists.
  new-epoch
      Ends a whole-database restore: devices re-upload what the server lost.
  unpack-copy <copy.db.br> <out.db>
      Decompresses a DB copy from the backup bucket (.br, or .gz for older
      ones) and checks its integrity. Refuses to overwrite <out.db>. Doesn't
      open the server database.
`;

/** Writes the database inside a backup copy to `out` and checks it. */
export async function unpackCopyFile(input: string, out: string) {
  if (existsSync(out)) throw new Error(`${out} exists; move it away first`);
  await writeFile(out, unpackCopy(input, await readFile(input)));
  // The output is usually /data/app.db: a file that fails the check must not
  // be left there for the server to start on.
  let result: unknown;
  try {
    const db = new Database(out, { readonly: true });
    try {
      result = db.pragma("integrity_check", { simple: true });
    } finally {
      db.close();
    }
  } catch (error) {
    result = error instanceof Error ? error.message : String(error);
  }
  if (result !== "ok") {
    await rm(out, { force: true });
    throw new Error(`integrity check: ${String(result)}`);
  }
}

/** Creates the owner, or explains why not. */
export async function createOwner(
  auth: Auth,
  email: string,
  name: string,
): Promise<string> {
  const ctx = await auth.$context;
  const owners = await ctx.internalAdapter.countTotalUsers([
    { field: "role", value: "owner" },
  ]);
  if (owners > 0) throw new Error("an owner already exists");
  const user = await ctx.internalAdapter.createUser(
    {
      email: email.toLowerCase(),
      name,
      // GitHub sign-in links only to an account with a verified email; the
      // person running this command vouches for it.
      emailVerified: true,
      role: "owner",
    },
    { method: "admin" },
  );
  return user.id;
}

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  if (command === "unpack-copy") {
    const [input, out] = rest;
    if (!input || !out) {
      process.stderr.write(USAGE);
      return 2;
    }
    await unpackCopyFile(input, out);
    console.log(`Wrote ${out}; integrity check ok`);
    return 0;
  }
  if (command !== "create-owner" && command !== "new-epoch") {
    process.stderr.write(USAGE);
    return 2;
  }
  const { database, auth } = await openServer(readConfig());
  try {
    if (command === "new-epoch") {
      console.log(`New epoch: ${await newEpoch(syncDb(database.db))}`);
      return 0;
    }
    const { values } = parseArgs({
      args: rest,
      options: { email: { type: "string" }, name: { type: "string" } },
    });
    if (!values.email) {
      process.stderr.write(USAGE);
      return 2;
    }
    const id = await createOwner(auth, values.email, values.name ?? "Owner");
    console.log(`Created owner ${values.email} (${id})`);
    return 0;
  } finally {
    await database.close();
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  });
}
