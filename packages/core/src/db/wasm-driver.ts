import type {
  BindingSpec,
  Database,
  PreparedStatement,
  Sqlite3Static,
} from "@sqlite.org/sqlite-wasm";
import type { Driver } from "./driver.ts";

/**
 * Driver over an open `@sqlite.org/sqlite-wasm` database. In the browser the
 * caller opens it in the DB worker through the SAH-pool VFS; see
 * docs/architecture.md#client-runtime.
 */
export function wasmDriver(sqlite3: Sqlite3Static, db: Database): Driver {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        reader: stmt.columnCount > 0,
        all(params) {
          try {
            bind(stmt, params);
            const rows: unknown[] = [];
            while (stmt.step()) rows.push(stmt.get({}));
            return rows;
          } finally {
            stmt.finalize();
          }
        },
        run(params) {
          try {
            bind(stmt, params);
            stmt.step();
            return {
              changes: db.changes(),
              lastInsertRowid: sqlite3.capi.sqlite3_last_insert_rowid(db),
            };
          } finally {
            stmt.finalize();
          }
        },
        *iterate(params) {
          try {
            bind(stmt, params);
            while (stmt.step()) yield stmt.get({});
          } finally {
            stmt.finalize();
          }
        },
      };
    },
    close: () => db.close(),
  };
}

function bind(stmt: PreparedStatement, params: readonly unknown[]) {
  // oo1 throws when binding to a statement without parameters, even an empty list.
  if (params.length > 0) stmt.bind(params as BindingSpec);
}
