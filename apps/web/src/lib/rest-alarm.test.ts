import { describe, expect, it } from "vitest";
import { mergeAlarmRest, type RestState } from "./rest-alarm.ts";

const state: RestState = {
  endsAt: 100_000,
  seconds: 90,
  finished: false,
  for: { sessionId: "s", sessionExerciseId: "e" },
};

describe("mergeAlarmRest", () => {
  it("clears the rest the alarm no longer has", () => {
    expect(mergeAlarmRest(state, null, 50_000)).toBeNull();
  });

  it("takes the end time and state from the alarm, the rest from the page", () => {
    expect(
      mergeAlarmRest(state, { endsAt: 115_000, finished: false }, 50_000),
    ).toEqual({ ...state, endsAt: 115_000 });
    expect(
      mergeAlarmRest(state, { endsAt: 100_000, finished: true }, 101_000),
    ).toEqual({ ...state, finished: true });
  });

  it("shows a rest the page has forgotten", () => {
    expect(
      mergeAlarmRest(null, { endsAt: 100_000, finished: false }, 40_000),
    ).toEqual({ endsAt: 100_000, seconds: 60, finished: false, for: null });
  });
});
