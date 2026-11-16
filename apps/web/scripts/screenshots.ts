import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import sharp from "sharp";

// Renders the README's screenshot collages (docs/screenshots) from Storybook
// stories, so they show fixture data and never a real account's. Run it only
// when asked: the collages may lag behind the UI, and each rerender adds
// binary files to git history.

interface Shot {
  story: string;
  title: string;
  caption: string;
}

interface Collage {
  name: string;
  viewport: { width: number; height: number };
  columns: number;
  width: number;
  frame: "phone" | "pc";
  shots: Shot[];
}

const collages: Collage[] = [
  {
    name: "phone",
    viewport: { width: 390, height: 844 },
    columns: 5,
    width: 1720,
    frame: "phone",
    shots: [
      {
        story: "screens-session--today-running",
        title: "Today",
        caption: "Running session and past sessions",
      },
      {
        story: "screens-session--session-running",
        title: "Session",
        caption: "Exercises, logged sets and records",
      },
      {
        story: "screens-session--ledger-rows",
        title: "Logging",
        caption: "Last time next to today, rest timer",
      },
      {
        story: "screens-session--add-exercise-by-muscle-group",
        title: "Add exercise",
        caption: "Search or filter by muscle group",
      },
      {
        story: "screens-history--exercise-history",
        title: "Exercise history",
        caption: "e1RM trend, records, every set",
      },
      {
        story: "screens-history--calendar-busy-days",
        title: "Calendar",
        caption: "Sessions by day and training frequency",
      },
      {
        story: "screens-routines--editor",
        title: "Routines",
        caption: "Workout days with alternatives",
      },
      {
        story: "screens-exercises--logged-stats",
        title: "Exercises",
        caption: "Catalog with your latest sets",
      },
      {
        story: "screens-settings--server-usage",
        title: "Settings",
        caption: "Sync, units, timers",
      },
      {
        story: "screens-history--exercise-history-dark",
        title: "Dark theme",
        caption: "Every screen, light and dark",
      },
    ],
  },
  {
    name: "pc",
    viewport: { width: 1366, height: 860 },
    columns: 2,
    width: 2200,
    frame: "pc",
    shots: [
      {
        story: "screens-session--ledger-rows",
        title: "Session and logging side by side",
        caption: "Exercise list, set ledger with last time's sets, rest timer",
      },
      {
        story: "screens-history--exercise-history",
        title: "Exercise history",
        caption: "Trend chart, records and recent sessions",
      },
      {
        story: "screens-history--calendar-busy-days",
        title: "Calendar and frequency",
        caption: "Sessions per week, days between sessions, sets per muscle",
      },
      {
        story: "screens-routines--add-builtin",
        title: "Routines",
        caption: "Workout days in columns, with alternatives per exercise",
      },
      {
        story: "screens-exercises--logged-stats",
        title: "Exercises",
        caption: "Catalog filtered by muscle, sorted by recent use",
      },
      {
        story: "screens-session--today-dark",
        title: "Today, dark theme",
        caption: "Running session and past sessions",
      },
    ],
  },
];

const storybookUrl = "http://localhost:6006";
const outDir = fileURLToPath(
  new URL("../../../docs/screenshots", import.meta.url),
);

async function storybookUp(): Promise<boolean> {
  try {
    return (await fetch(`${storybookUrl}/index.json`)).ok;
  } catch {
    return false;
  }
}

async function startStorybook(): Promise<ChildProcess> {
  const cli = fileURLToPath(
    import.meta.resolve("storybook/internal/bin/dispatcher"),
  );
  const child = spawn(
    process.execPath,
    [cli, "dev", "-p", "6006", "--ci", "--no-open"],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      stdio: "ignore",
      // Its own process group, so stopStorybook reaches the server the
      // dispatcher spawns.
      detached: process.platform !== "win32",
    },
  );
  const deadline = Date.now() + 120_000;
  while (!(await storybookUp())) {
    if (Date.now() > deadline)
      throw new Error("Storybook did not start in 2 minutes.");
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return child;
}

function stopStorybook(child: ChildProcess) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
  } else {
    process.kill(-child.pid);
  }
}

/** Screenshots a story once its play function has run. */
async function shoot(
  browser: Browser,
  collage: Collage,
  story: string,
): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: collage.viewport,
    deviceScaleFactor: 2,
    hasTouch: collage.frame === "phone",
  });
  await page.goto(`${storybookUrl}/iframe.html?id=${story}&viewMode=story`);
  const outcome = await page.waitForFunction(
    () => {
      type Channel = { on(event: string, listener: () => void): void };
      const w = window as unknown as {
        __STORYBOOK_ADDONS_CHANNEL__?: Channel;
        shotOutcome?: string;
        shotListening?: boolean;
      };
      const channel = w.__STORYBOOK_ADDONS_CHANNEL__;
      if (!channel) return undefined;
      if (!w.shotListening) {
        w.shotListening = true;
        for (const event of [
          "storyRendered",
          "playFunctionThrewException",
          "storyErrored",
          "storyThrewException",
        ]) {
          channel.on(event, () => {
            w.shotOutcome = event;
          });
        }
      }
      return w.shotOutcome;
    },
    undefined,
    { timeout: 30_000, polling: 100 },
  );
  if ((await outcome.jsonValue()) !== "storyRendered") {
    throw new Error(
      `${story} failed at ${collage.frame} size: ${await outcome.jsonValue()}`,
    );
  }
  // Charts animate in after the story reports it has rendered.
  await page.waitForTimeout(800);
  const image = await page.screenshot();
  await page.close();
  return image;
}

const css = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: "Segoe UI", system-ui, sans-serif; background: #e9e6df; color: #1c1b19; padding: 56px; }
  .grid { display: grid; gap: 40px 32px; }
  figure { display: flex; flex-direction: column; gap: 12px; }
  figcaption b { display: block; font-size: 19px; font-weight: 600; }
  figcaption span { font-size: 15px; color: #6b675f; }
  img { display: block; width: 100%; background: white;
        box-shadow: 0 1px 2px rgb(0 0 0 / 0.08), 0 12px 32px rgb(0 0 0 / 0.12); }
  .phone img { border-radius: 30px; border: 6px solid #1c1b19; }
  .pc img { border-radius: 10px; border: 1px solid rgb(0 0 0 / 0.12); }
`;

function collageHtml(collage: Collage, images: Buffer[]): string {
  const figures = collage.shots
    .map(
      (shot, i) => `<figure>
        <figcaption><b>${shot.title}</b><span>${shot.caption}</span></figcaption>
        <img src="data:image/png;base64,${images[i]?.toString("base64")}">
      </figure>`,
    )
    .join("");
  return `<!doctype html><html><head><style>${css}</style></head>
    <body class="${collage.frame}">
    <div class="grid" style="grid-template-columns: repeat(${collage.columns}, 1fr)">${figures}</div>
    </body></html>`;
}

const storybook = (await storybookUp()) ? undefined : await startStorybook();
const browser = await chromium.launch();
try {
  mkdirSync(outDir, { recursive: true });
  for (const collage of collages) {
    const images: Buffer[] = [];
    for (const shot of collage.shots)
      images.push(await shoot(browser, collage, shot.story));
    const page = await browser.newPage({
      viewport: { width: collage.width, height: 800 },
    });
    await page.setContent(collageHtml(collage, images), { waitUntil: "load" });
    const png = await page.screenshot({ fullPage: true });
    await page.close();
    const file = `${outDir}/${collage.name}.webp`;
    writeFileSync(
      file,
      await sharp(png).webp({ quality: 88, effort: 6 }).toBuffer(),
    );
    console.log(`Wrote ${file}`);
  }
} finally {
  await browser.close();
  if (storybook) stopStorybook(storybook);
}
