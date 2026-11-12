/** Shared components (`components/`) and messages raised in `lib/`. */
export const ui = {
  toasts: {
    dismiss: "Dismiss",
  },
  command: {
    undoFailed: "Can't undo: something else has changed since then",
    saveFailed: "That didn't save",
  },
  stepper: {
    less: "Decrease {{label}}",
    more: "Increase {{label}}",
    inUnit: "in {{unit}}",
  },
  chart: {
    showAll: "Show all",
    trend: "Trend {{rate}}",
    seriesTrend: "{{series}} trend {{rate}}",
    trendInRange: "{{trends}} in the shown range",
    axisDay: "{MMM} {d}",
  },
  appUpdate: {
    available: "Version {{version}} is available",
    download: "Download",
    downloadFailed: "Couldn't start the download",
  },
  errors: {
    serverAnswered: "The server answered {{status}}",
  },
  account: {
    signInFailed: "Sign-in failed",
    signInUnfinished: "The sign-in didn't finish",
    signupClosed: "No new accounts at the moment.",
    accountDisabled: "This account is disabled.",
    welcomeTitle: "Welcome",
    welcomeText:
      "Your account is ready. What you logged on this device uploads in the first sync.",
  },
  sync: {
    savedFirstTitle: "Saved this device's data first",
    notDiscardedTitle: "Nothing was discarded",
    snapshotFailed: "Saving a snapshot first failed: {{reason}}",
  },
  backupWarning: {
    unsynced: "Changes haven't synced for days",
    backupStale: "A server backup is out of date",
    databaseLarge: "The server database is over 700 MB",
  },
  restTimer: {
    failedTitle: "The rest timer didn't start",
    failedText: "Android only starts it while the app is open.",
  },
} as const;
