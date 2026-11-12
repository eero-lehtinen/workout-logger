import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { settled, withBackStack } from "./history-stack.ts";
import { goBack, type Navigator, switchTab } from "./navigation.ts";

/**
 * A router over a history that holds `paths`, each pushed from the one
 * before. Outside a browser the real router doesn't write to its history,
 * so this one does that directly, for paths without params.
 */
async function routerAt(...paths: [string, ...string[]]): Promise<Navigator> {
  const history = withBackStack(
    createMemoryHistory({ initialEntries: [paths[0]] }),
  );
  for (const path of paths.slice(1)) history.push(path);
  await settled(history);
  const pathOf = (options: { to?: string }) => options.to ?? "/";
  return {
    history,
    buildLocation: (options) => ({ pathname: pathOf(options) }),
    navigate: async (options) => {
      if (options.replace) history.replace(pathOf(options));
      else history.push(pathOf(options));
      await settled(history);
    },
  };
}

function entries(router: Navigator) {
  const { history } = router;
  const at = history.location.state.__TSR_index;
  const seen: string[] = [];
  history.go(-at);
  for (let i = 0; i < history.length; i++) {
    seen.push(history.location.pathname);
    history.forward();
  }
  history.go(at - (history.length - 1));
  return { at, paths: seen };
}

const benchHistory = "/exercises/bench/history";

describe("history entries", () => {
  it("record the pathname they were pushed from, kept across replaces", async () => {
    const router = await routerAt("/", "/exercises", benchHistory);
    expect(router.history.location.state.from).toBe("/exercises");
    router.history.replace(`${benchHistory}?period=year`);
    expect(router.history.location.state.from).toBe("/exercises");
  });

  it("replace the current entry for a link to the current URL", async () => {
    const router = await routerAt("/", "/exercises");
    router.history.push("/exercises");
    expect(entries(router)).toEqual({ at: 1, paths: ["/", "/exercises"] });
    expect(router.history.location.state.from).toBe("/");
  });

  it("replace an open dialog's entry when leaving its page", async () => {
    const router = await routerAt("/", "/exercises");
    router.history.push("/exercises", { dialog: "picker" });
    router.history.push(benchHistory);
    expect(entries(router)).toEqual({
      at: 2,
      paths: ["/", "/exercises", benchHistory],
    });
    expect(router.history.location.state.dialog).toBeUndefined();
    expect(router.history.location.state.from).toBe("/exercises");
  });
});

describe("goBack", () => {
  it("goes back when the screen was opened from the target", async () => {
    const router = await routerAt("/", "/exercises", benchHistory);
    await goBack(router, { to: "/exercises" });
    expect(entries(router)).toEqual({
      at: 1,
      paths: ["/", "/exercises", benchHistory],
    });
  });

  it("replaces the screen when it was opened from elsewhere", async () => {
    const router = await routerAt("/", "/history", benchHistory);
    await goBack(router, { to: "/exercises" });
    expect(entries(router)).toEqual({
      at: 2,
      paths: ["/", "/history", "/exercises"],
    });
  });

  it("replaces a screen that the history starts on", async () => {
    const router = await routerAt(benchHistory);
    await goBack(router, { to: "/exercises" });
    expect(entries(router)).toEqual({ at: 0, paths: ["/exercises"] });
  });
});

describe("switchTab", () => {
  it("leaves Today and the tab", async () => {
    const router = await routerAt("/", "/exercises", benchHistory);
    await switchTab(router, "/history");
    const { at, paths } = entries(router);
    expect({ at, paths: paths.slice(0, 2) }).toEqual({
      at: 1,
      paths: ["/", "/history"],
    });
  });

  it("returns to Today", async () => {
    const router = await routerAt("/", "/exercises", benchHistory);
    await switchTab(router, "/");
    expect(router.history.location.pathname).toBe("/");
    expect(entries(router).at).toBe(0);
  });

  it("puts Today under a tab opened from a screen the history starts on", async () => {
    const router = await routerAt(benchHistory);
    await switchTab(router, "/settings");
    expect(entries(router)).toEqual({ at: 1, paths: ["/", "/settings"] });
  });

  it("puts Today first when the history starts elsewhere", async () => {
    const router = await routerAt("/settings", "/exercises", benchHistory);
    await switchTab(router, "/routines");
    const { at, paths } = entries(router);
    expect({ at, paths: paths.slice(0, 2) }).toEqual({
      at: 1,
      paths: ["/", "/routines"],
    });
  });
});
