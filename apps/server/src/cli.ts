import { parseArgs } from "node:util";
import { newEpoch } from "@workout-logger/core/sync-server";
import type { Auth } from "./auth/auth.ts";
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
`;

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
