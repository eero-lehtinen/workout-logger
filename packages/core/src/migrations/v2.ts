import type { Migration } from "./types.ts";

/** Routines get a free-text description. */
export const v2: Migration = {
  version: 2,
  async up(db) {
    await db.schema
      .alterTable("routine")
      .addColumn("description", "text", (c) => c.notNull().defaultTo(""))
      .execute();
  },
  upgrade: {
    routine: ({ id, data }) => [
      { table: "routine", id, data: { ...data, description: "" } },
    ],
  },
};
