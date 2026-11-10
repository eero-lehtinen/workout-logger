import Database from "better-sqlite3";
import type { Driver } from "./driver.ts";

/** better-sqlite3 driver for Node: tests, the CLI, and the server. */
export function openNodeDriver(filename = ":memory:"): Driver {
  return nodeDriver(new Database(filename));
}

export function nodeDriver(db: Database.Database): Driver {
  return {
    prepare(sql) {
      const stmt = db.prepare<unknown[]>(sql);
      return {
        reader: stmt.reader,
        all: (params) => stmt.all(...params),
        run: (params) => stmt.run(...params),
        iterate: (params) => stmt.iterate(...params),
      };
    },
    close: () => db.close(),
  };
}
