import { execFile } from "node:child_process";
import { request } from "node:http";
import { promisify } from "node:util";
import type { R2Config } from "./r2.ts";

const execFileAsync = promisify(execFile);

/** The replica's `path` in the Litestream config in deploy/compose.yaml. */
const REPLICA_PATH = "app.db";

/**
 * Restores the newest state of the Litestream replica in `replica` to the new
 * file `out`, with the `litestream` binary the image copies from the
 * Litestream image. The token goes in the environment, never on the command
 * line, and the child gets nothing else from the server's environment.
 */
export async function restoreReplica(
  replica: R2Config,
  out: string,
): Promise<void> {
  const url = new URL(`s3://${replica.bucket}/${REPLICA_PATH}`);
  url.searchParams.set("endpoint", replica.endpoint);
  url.searchParams.set("region", "auto");
  try {
    await execFileAsync("litestream", ["restore", "-o", out, url.href], {
      env: {
        PATH: process.env.PATH ?? "",
        LITESTREAM_ACCESS_KEY_ID: replica.accessKeyId,
        LITESTREAM_SECRET_ACCESS_KEY: replica.secretAccessKey,
      },
      timeout: 10 * 60 * 1000,
    });
  } catch (error) {
    const { stderr, message } = error as { stderr?: string; message: string };
    const last = stderr?.trim().split("\n").at(-1);
    throw new Error(`litestream restore failed: ${last || message}`);
  }
}

/**
 * The time Litestream last uploaded the database to its replica, from its
 * control socket's `GET /list` (Litestream 0.5; its Prometheus metrics have
 * no such timestamp). Null when Litestream hasn't synced yet or can't be
 * reached.
 */
export function litestreamLastSync(
  socketPath: string,
  databasePath: string,
): Promise<number | null> {
  return new Promise((resolve) => {
    const req = request(
      { socketPath, path: "/list", method: "GET", timeout: 2000 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const list = JSON.parse(body) as {
              databases?: { path: string; last_sync_at?: string }[];
            };
            const entry = list.databases?.find((d) => d.path === databasePath);
            const at = entry?.last_sync_at
              ? Date.parse(entry.last_sync_at)
              : NaN;
            resolve(Number.isFinite(at) ? at : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}
