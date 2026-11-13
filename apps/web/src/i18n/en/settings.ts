export const settings = {
  title: "Settings",
  units: {
    title: "Units and weight step",
    weightUnit: "Weight unit",
    weightStep: "Weight step",
    weightStepWithUnit: "Weight step ({{unit}})",
    weightStepHint: "The +/− step, unless an exercise sets its own.",
  },
  timers: {
    title: "Timers",
    restTimer: "Rest timer",
    restTimerHint: "Counts down after each logged set.",
    restTime: "Rest time",
    restTimeHint: "m:ss. Exercises can set their own.",
    alertVolume: "Alert volume",
    alertVolumeHintNative: "Relative to the phone's media volume.",
    alertVolumeHintWeb: "The sound at the end of a rest.",
    sessionTimer: "Session timer",
    sessionTimerHint: "Shows how long the running session has lasted.",
    idleEnd: "Auto-end after (min)",
    idleEndLabel: "Auto-end after (minutes)",
    idleEndHint:
      "If no set is logged for this long, the session ends. Its end time is the last set.",
  },
  sessions: {
    title: "Sessions",
    keepScreenOn: "Keep screen on",
    keepScreenOnHint: "While a session is running.",
    repLimit: "e1RM rep limit",
    repLimitHint: "Sets with more reps get no e1RM and can't be PRs.",
    weekStart: "Week starts on",
    weekStartHint: "The calendar's first column and where weekly counts split.",
    monday: "Mon",
    sunday: "Sun",
  },
  appearance: {
    title: "Appearance",
    theme: "Theme",
    themeHint: "On this device only.",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    language: "Language",
    languageHint: "On this device only.",
    languageSystem: "System",
  },
  account: {
    title: "Account and sync",
    signedOut: "Sign-in expired",
    sync: "Sync",
    expiredHint:
      "Your sign-in expired. Sign in again to keep syncing; nothing logged here is lost.",
    signInHint:
      "Sign in to sync your devices. Synced data is not encrypted. <privacy>Privacy</privacy>",
    signIn: "Sign in",
    signInWith: "Sign in with {{provider}}",
    signInFailed: "Couldn't start sign-in",
    emailOffline: "{{email}} · offline",
    clockAhead: "Clock ahead",
    clockAheadHint:
      "This device's clock was ahead when you logged some changes, so the server refused them. Set the clock right, then repair.",
    repairClock: "Repair clock",
    signOut: "Sign out",
    signOutSynced:
      "Your data stays on this device. It stops syncing until you sign in again.",
    signOutUnsynced_one:
      "Your data stays on this device, but {{count}} unsynced change won't reach your other devices until you sign in again.",
    signOutUnsynced_other:
      "Your data stays on this device, but {{count}} unsynced changes won't reach your other devices until you sign in again.",
    admin: "Admin",
    adminHint: "Server storage and backups, accounts, and quotas.",
    open: "Open",
    choice: {
      title: "This device has another account's data",
      description:
        "Merge adds it to the account you signed in with. Discard saves it to a snapshot file, removes it from this device, and loads this account's data instead; the other account keeps what it synced.",
      unsynced_one:
        "{{count}} change made here never reached the server; after a discard it is only in that file.",
      unsynced_other:
        "{{count}} changes made here never reached the server; after a discard they are only in that file.",
      merge: "Merge",
      discard: "Discard this device's data",
      signOut: "Sign out",
    },
  },
  sync: {
    label: "Sync",
    now: "Sync now",
    syncing: "Syncing…",
    notYet: "Not synced yet.",
    synced: "Synced {{ago}}.",
    pending_one: "{{count}} change not synced yet.",
    pending_other: "{{count}} changes not synced yet.",
    problem: {
      accountDisabled:
        "This account is disabled. Your data stays on this device; sync resumes if the owner enables it.",
      updateRequired: "Update the app to keep syncing.",
      offline: "Offline; syncs when the server can be reached.",
      server: "The last sync failed; it is retried every minute.",
      rateLimited:
        "Too many requests to the server; sync tries again in a minute.",
      downloadQuota:
        "Sync paused: this device downloaded everything too often today. It resumes tomorrow.",
      storageFull:
        "Sync paused: your server storage is full. Ask the owner for more.",
      uploadLimit:
        "Sync paused: today's upload limit is reached. It resumes tomorrow.",
      refused: "The server refused some changes. They stay on this device.",
    },
    usage: {
      label: "Server storage",
      stored: "Stored: {{value}}",
      uploadedToday: "Uploaded today: {{value}}",
      of: "{{used}} of {{limit}}",
      noLimit: "{{used}}, no limit for now",
    },
  },
  data: {
    title: "Data",
    exportSnapshot: "Export snapshot",
    exportHintNative:
      "Saves all your data as one file in Documents/{{folder}}.",
    exportHintWeb:
      "Downloads all your data as one file. Keep it somewhere safe.",
    export: "Export",
    snapshotSaved: "Snapshot saved",
    exportFailed: "Export failed",
    importSnapshot: "Import snapshot",
    importHint: "From a file exported here.",
    import: "Import",
    importChoice:
      "Merge keeps the newer version of anything in both. Replace first saves your current data as a snapshot file, then makes your data match the imported file exactly.",
    merge: "Merge",
    replaceEverything: "Replace everything",
    imported: "Snapshot imported",
    importedMerge_one: "{{count}} item was updated from the file.",
    importedMerge_other: "{{count}} items were updated from the file.",
    importedReplace: "{{written}} items updated, {{deleted}} removed.",
    undoFailed: "Can't undo: something else has changed since then",
    undoFailedHint: "Import the snapshot saved before the replace to go back.",
    importFailed: "Import failed",
    savedFirst: "Saved your current data first",
    notReplaced: "Nothing was replaced",
    saveFirstFailed: "Saving your current data first failed: {{error}}",
    autoSnapshots: "Automatic snapshots",
    autoSnapshotsNone:
      "Saved to Documents/{{folder}} after each session; the newest 10 are kept. None saved yet.",
    autoSnapshotsLast:
      "Saved to Documents/{{folder}} after each session; the newest 10 are kept. Last: {{time}}.",
    autoSnapshotFailed: "Couldn't save the snapshot file",
    install: "Install app",
    installHintAvailable:
      "Opens from your home screen or desktop, works offline, and keeps the browser from clearing your data.",
    installHintManual:
      "Install from your browser's menu. On iPhone: Share, then Add to Home Screen.",
    installButton: "Install",
    storage: "Storage",
    storageUnknown:
      "This browser doesn't report whether your data is protected from cleanup.",
    storageProtected:
      "Protected: the browser won't clear your data to free space.",
    storageUnprotected:
      "Not protected: the browser may clear your data when space runs low. Installing the app usually protects it. Until then, export regularly.",
    askBrowser: "Ask browser",
    askBrowserDenied: "The browser didn't allow it",
    askBrowserDeniedHint:
      "Chrome decides on its own, mostly once the app is installed. The app asks again when you install it.",
    androidApp: "Android app",
    androidAppHint:
      "Version {{version}}. Its rest timer also alerts in the background. It keeps its own data: move yours over with a snapshot.",
    download: "Download",
  },
  about: {
    title: "About",
    webBuild: "Web app build",
    webBuildCommit: "{{commit}}",
    webBuildCommitTime: "{{commit}}, built {{time}}",
    unknownCommit: "Unknown commit",
    privacy: "Privacy",
    privacyHint: "What the server stores and for how long.",
    openPrivacy: "Open privacy page",
    open: "Open",
    version: "Version",
    versionHint: "{{version}}. Updates are also checked when the app starts.",
    checkForUpdates: "Check for updates",
    updateAvailable: "Version {{version}} is available",
    download: "Download",
    updateDownloaded: "An update is downloaded",
    updateDownloadedHint:
      "The update is applied the next time you leave the app.",
    upToDate: "The app is up to date",
    checkFailed: "Couldn't check for updates",
  },
  deleteAccount: {
    label: "Delete account",
    hint: "Removes your data from the server. This device keeps its copy.",
    body: "The server deletes your account and all your workout data right away. Your other devices stop syncing. This device keeps its data and signs out.",
    backups: "Older backups still contain your data until they are deleted:",
    keepCopy: "Keep a copy of your data first.",
    typeEmail: "Type {{email}} to confirm",
    deleted: "Account deleted",
    deletedHint: "This device keeps its data and no longer syncs.",
    failed: "The account wasn't deleted",
  },
} as const;
