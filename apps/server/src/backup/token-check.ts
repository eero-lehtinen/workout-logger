import { type R2Config, type R2Request, r2Status } from "./r2.ts";

/** Never a Litestream path, which are all under `app.db/`. */
const PROBE_KEY = "token-check";

/** What R2 answers a valid token that lacks the permission. */
const DENIED = 403;

/**
 * Checks that the app's two R2 tokens can do no more than they need
 * (docs/backups.md#storage-isolation): the read token can't write the
 * replica or reach the copies, and the backups token can't reach the
 * replica. Each probe must be refused with 403; any other answer, including
 * an error from R2, fails the check, since it proves nothing. Throws what is
 * wrong.
 */
export async function checkTokenSeparation(
  backups: R2Config,
  replica: R2Config,
  status: (config: R2Config, request: R2Request) => Promise<number> = r2Status,
): Promise<void> {
  const put = await status(replica, { action: "put", key: PROBE_KEY });
  if (put >= 200 && put < 300) {
    await status(replica, { action: "delete", key: PROBE_KEY });
    throw new Error(
      `the replica read token can write to ${replica.bucket}; give it Object Read only`,
    );
  }
  const probes: [string, number][] = [
    [`the replica read token writing to ${replica.bucket}`, put],
    [
      `the replica read token listing ${backups.bucket}`,
      await status({ ...replica, bucket: backups.bucket }, { action: "list" }),
    ],
    [
      `the backups token listing ${replica.bucket}`,
      await status({ ...backups, bucket: replica.bucket }, { action: "list" }),
    ],
  ];
  const wrong = probes.filter(([, answer]) => answer !== DENIED);
  if (wrong.length > 0) {
    throw new Error(
      wrong
        .map(([probe, answer]) => `${probe} got ${answer}, not ${DENIED}`)
        .join("; "),
    );
  }
}
