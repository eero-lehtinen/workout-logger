import { parseArgs } from "node:util";
import { newEpoch } from "@workout-logger/core/sync-server";
import type { Auth } from "./auth/auth.ts";
import { unpackCopyFile } from "./backup/db-copy.ts";
import { readConfig } from "./config.ts";
import { syncDb } from "./db/database.ts";
import { openServer } from "./startup.ts";

const USAGE = `Usage: server <command>

  create-owner --email <email> [--name <name>]
      Creates the owner account. The first sign-in with a provider that
      reports <email> as verified links to it. Refuses if an owner exists.
  set-email --user <id or email> --email <email>
      Changes an account's email, marked verified, so the next sign-in with
      a provider reporting <email> links to it.
  new-epoch
      Ends a whole-database restore: devices re-upload what the server lost.
  unpack-copy <copy.db.br> <out.db>
      Decompresses a DB copy from the backup bucket (.br, or .gz for older
      ones) and checks its integrity. Refuses to overwrite <out.db>. Doesn't
      open the server database.
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
      // Sign-in links only to an account with a verified email; the person
      // running this command vouches for it.
      emailVerified: true,
      role: "owner",
    },
    { method: "admin" },
  );
  return user.id;
}

/** Changes the email of the account `user` (an id or the current email). */
export async function setEmail(
  auth: Auth,
  user: string,
  email: string,
): Promise<string> {
  const ctx = await auth.$context;
  const target =
    (await ctx.internalAdapter.findUserById(user)) ??
    (await ctx.internalAdapter.findUserByEmail(user.toLowerCase()))?.user;
  if (!target) throw new Error(`no account ${user}`);
  const lower = email.toLowerCase();
  const taken = await ctx.internalAdapter.findUserByEmail(lower);
  if (taken && taken.user.id !== target.id) {
    throw new Error(`another account already has ${lower}`);
  }
  await ctx.internalAdapter.updateUser(target.id, {
    email: lower,
    // As in create-owner: the person running this command vouches for it.
    emailVerified: true,
  });
  return target.id;
}

const COMMANDS = ["create-owner", "set-email", "new-epoch"] as const;

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
  if (!COMMANDS.includes(command as never)) {
    process.stderr.write(USAGE);
    return 2;
  }
  const { values } = parseArgs({
    args: rest,
    options: {
      email: { type: "string" },
      name: { type: "string" },
      user: { type: "string" },
    },
  });
  if (
    (command !== "new-epoch" && !values.email) ||
    (command === "set-email" && !values.user)
  ) {
    process.stderr.write(USAGE);
    return 2;
  }
  const { database, auth } = await openServer(readConfig());
  try {
    if (command === "new-epoch") {
      console.log(`New epoch: ${await newEpoch(syncDb(database.db))}`);
    } else if (command === "set-email") {
      const id = await setEmail(auth, values.user ?? "", values.email ?? "");
      console.log(`Set the email of ${id} to ${values.email}`);
    } else {
      const email = values.email ?? "";
      const id = await createOwner(auth, email, values.name ?? "Owner");
      console.log(`Created owner ${email} (${id})`);
    }
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
