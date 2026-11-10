import { request } from "node:http";

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
