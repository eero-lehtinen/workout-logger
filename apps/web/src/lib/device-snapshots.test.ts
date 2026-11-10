import type { SessionSummary } from "@workout-logger/core";
import { describe, expect, it } from "vitest";
import {
  snapshotDue,
  snapshotFileName,
  snapshotsToPrune,
} from "./device-snapshots.ts";

const MIN = 60_000;
const IDLE_S = 15 * 60;

function session(over: Partial<SessionSummary>): SessionSummary {
  return {
    id: "s",
    routineId: null,
    dayId: null,
    routineName: null,
    dayName: null,
    startedAt: 0,
    tz: "UTC",
    endedAt: null,
    endReason: null,
    notes: "",
    exerciseCount: 1,
    setCount: 1,
    lastSetAt: null,
    ...over,
  };
}

describe("snapshotFileName", () => {
  it("is a UTC timestamp without colons", () => {
    expect(snapshotFileName(new Date("2026-11-10T14:03:22.500Z"))).toBe(
      "workout-logger-2026-11-10T14-03-22.sqlite3",
    );
  });
});

describe("snapshotsToPrune", () => {
  const names = Array.from(
    { length: 12 },
    (_, i) =>
      `workout-logger-2026-11-${String(i + 1).padStart(2, "0")}T10-00-00.sqlite3`,
  );

  it("keeps the newest ten", () => {
    expect(snapshotsToPrune([...names].reverse())).toEqual([
      names[1],
      names[0],
    ]);
  });

  it("leaves other files alone", () => {
    expect(
      snapshotsToPrune(["notes.txt", "workout-logger-old.db", ...names], 12),
    ).toEqual([]);
  });
});

describe("snapshotDue", () => {
  const ended = session({ startedAt: 0, endedAt: 60 * MIN });

  it("is due after a session ended manually", () => {
    expect(snapshotDue([ended], 61 * MIN, IDLE_S, null)).toBe(true);
    expect(snapshotDue([ended], 61 * MIN, IDLE_S, 30 * MIN)).toBe(true);
  });

  it("is not due once a snapshot follows the last session", () => {
    expect(snapshotDue([ended], 90 * MIN, IDLE_S, 61 * MIN)).toBe(false);
  });

  it("waits while a session is running", () => {
    const running = session({ startedAt: 100 * MIN, lastSetAt: 110 * MIN });
    expect(snapshotDue([running, ended], 112 * MIN, IDLE_S, null)).toBe(false);
  });

  it("is due once the running session idles out", () => {
    const idle = session({ startedAt: 100 * MIN, lastSetAt: 110 * MIN });
    expect(snapshotDue([idle, ended], 126 * MIN, IDLE_S, 61 * MIN)).toBe(true);
  });

  it("is not due without sessions", () => {
    expect(snapshotDue([], 0, IDLE_S, null)).toBe(false);
  });
});
