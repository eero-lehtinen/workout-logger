import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  deterministicHlc,
  formatHlc,
  type Hlc,
  isValidHlc,
  MAX_COUNTER,
  parseHlc,
  receive,
  tick,
} from "./hlc.ts";

const at = (wall: number, counter: number, node = "aaaaaaaaaaaa"): Hlc => ({
  wall,
  counter,
  node,
});

describe("format", () => {
  it("is fixed width and round-trips", () => {
    const text = formatHlc(at(1762780000000, 7, "k3j9x2"));
    expect(text).toBe("001762780000000-00007-k3j9x2");
    expect(parseHlc(text)).toEqual(at(1762780000000, 7, "k3j9x2"));
  });

  it("rejects anything but the strict format", () => {
    for (const bad of [
      "1762780000000-00007-k3j9x2",
      "001762780000000-7-k3j9x2",
      "001762780000000-00007-",
      "001762780000000-00007-K3J",
      "001762780000000-00007-node with space",
      "001762780000000-00007-k3j9x2\n",
      "001762780000000-00007-abcdefghijklmnopq",
    ]) {
      expect(isValidHlc(bad), bad).toBe(false);
      expect(() => parseHlc(bad)).toThrow();
    }
  });

  it("sorts as text in HLC order", () => {
    const hlc = fc.record({
      wall: fc.integer({ min: 0, max: 10 ** 15 - 1 }),
      counter: fc.integer({ min: 0, max: MAX_COUNTER }),
      node: fc.stringMatching(/^[0-9a-z]{1,16}$/),
    });
    const compare = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
    fc.assert(
      fc.property(hlc, hlc, (a, b) => {
        const expected =
          Math.sign(a.wall - b.wall || a.counter - b.counter) ||
          compare(a.node, b.node);
        expect(compare(formatHlc(a), formatHlc(b))).toBe(expected);
      }),
    );
  });

  it("builds deterministic HLCs with counter 0", () => {
    expect(deterministicHlc(1700000000000, "seed")).toBe(
      "001700000000000-00000-seed",
    );
  });
});

describe("tick", () => {
  it("uses the wall clock when it is ahead", () => {
    expect(tick(at(100, 5), 200, "me")).toEqual(at(200, 0, "me"));
    expect(tick(null, 200, "me")).toEqual(at(200, 0, "me"));
  });

  it("increments the counter when the wall clock is not ahead", () => {
    expect(tick(at(100, 5), 100, "me")).toEqual(at(100, 6, "me"));
    expect(tick(at(100, 5), 50, "me")).toEqual(at(100, 6, "me"));
  });

  it("advances the wall on counter overflow", () => {
    expect(tick(at(100, MAX_COUNTER), 100, "me")).toEqual(at(101, 0, "me"));
  });
});

describe("receive", () => {
  it("takes the max of local, remote, and now", () => {
    expect(receive(at(100, 5), at(90, 9), 300, "me")).toEqual(at(300, 0, "me"));
  });

  it("increments past both when all walls are equal", () => {
    expect(receive(at(100, 5), at(100, 9), 50, "me")).toEqual(
      at(100, 10, "me"),
    );
    expect(receive(at(100, 9), at(100, 5), 50, "me")).toEqual(
      at(100, 10, "me"),
    );
  });

  it("increments the local counter when only the local wall is max", () => {
    expect(receive(at(100, 5), at(90, 9), 50, "me")).toEqual(at(100, 6, "me"));
  });

  it("increments the remote counter when only the remote wall is max", () => {
    expect(receive(at(100, 5), at(200, 9), 50, "me")).toEqual(
      at(200, 10, "me"),
    );
    expect(receive(null, at(200, 9), 50, "me")).toEqual(at(200, 10, "me"));
  });

  it("advances the wall on counter overflow", () => {
    expect(receive(at(100, 1), at(100, MAX_COUNTER), 50, "me")).toEqual(
      at(101, 0, "me"),
    );
  });

  it("is always greater than both inputs", () => {
    const hlc = fc.record({
      wall: fc.integer({ min: 0, max: 1000 }),
      counter: fc
        .integer({ min: MAX_COUNTER - 3, max: MAX_COUNTER })
        .chain((hi) =>
          fc.oneof(fc.constant(hi), fc.integer({ min: 0, max: 3 })),
        ),
      node: fc.constantFrom("aaaaaaaaaaaa", "bbbbbbbbbbbb"),
    });
    fc.assert(
      fc.property(
        hlc,
        hlc,
        fc.integer({ min: 0, max: 1000 }),
        (last, remote, now) => {
          const next = formatHlc(receive(last, remote, now, "cccccccccccc"));
          expect(next > formatHlc(last)).toBe(true);
          expect(next > formatHlc(remote)).toBe(true);
        },
      ),
    );
  });
});
