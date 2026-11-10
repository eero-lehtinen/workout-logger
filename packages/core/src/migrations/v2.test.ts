import { describe, expect, it } from "vitest";
import { migrateFixture } from "../testing.ts";
import { upgradeRow } from "./upgrade.ts";

const HLC = "001700000000000-00000-aaaaaaaaaaaa";
const routine = { name: "Upper/Lower", position: "a0", archived: 0 };

describe("v2: routine descriptions", () => {
  it("gives v1 routines an empty description", () => {
    expect(
      upgradeRow({ table: "routine", id: "r1", data: routine }, 1),
    ).toEqual([
      { table: "routine", id: "r1", data: { ...routine, description: "" } },
    ]);
  });

  it("migrates a v1 database like the row upgrade, keeping HLCs and tombstones", async () => {
    const { migrated, expected } = await migrateFixture({
      fromVersion: 1,
      rows: [
        { table: "routine", id: "r1", hlc: HLC, data: routine },
        { table: "routine", id: "r2", hlc: HLC, deleted: 1, data: routine },
        {
          table: "routine_day",
          id: "d1",
          hlc: HLC,
          data: { routine_id: "r1", name: "Upper", position: "a0" },
        },
      ],
    });
    expect(migrated).toEqual(expected);
    expect(migrated.routine).toEqual([
      { id: "r1", hlc: HLC, deleted: 0, ...routine, description: "" },
      { id: "r2", hlc: HLC, deleted: 1, ...routine, description: "" },
    ]);
  });
});
