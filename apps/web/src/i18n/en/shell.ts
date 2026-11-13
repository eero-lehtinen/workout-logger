/** The app shell and the screens shown before the database opens. */
export const shell = {
  appName: "Workout Logger",
  mainNav: "Main",
  nav: {
    today: "Today",
    history: "History",
    routines: "Routines",
    exercises: "Exercises",
    settings: "Settings",
  },
  sessionRunning: "Session running",
  notFound: "This page doesn't exist.",
  gate: {
    opening: "Opening your log…",
    elsewhereTitle: "Open in another tab",
    elsewhereText:
      "Your log can be open in one tab at a time. Using it here closes it in the other tab.",
    useHere: "Use here",
    blockedTitle: "Still open in another window",
    blockedText:
      "The browser has paused the other window, so it can't let go of your log yet. Switch to it or close it; this opens on its own after that.",
    tooNewTitle: "Update the app",
    tooNewUpdate:
      "A newer version of the app saved your data. Update the app to open it.",
    tooNewReload:
      "A newer version of the app saved your data. Reload to open it.",
    failedTitle: "Your log didn't open",
    failedText: "Your data is untouched. Try again, or reload the app.",
  },
} as const;
