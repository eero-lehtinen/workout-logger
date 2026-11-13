export const admin = {
  title: "Admin",
  ownerOnly: "Only the owner can see this page.",
  loading: "Loading…",
  accounts: {
    title: "Accounts",
    loadFailed: "Couldn't load the accounts: {{error}}",
    searchPlaceholder: "Search by name or email",
    searchLabel: "Search accounts",
    noMatch: "No account matches.",
    owner: "owner",
    disabled: "disabled",
    usage: "{{stored}} stored · {{today}} uploaded today · {{synced}}",
    usageOf: "{{used}} of {{limit}}",
    neverSynced: "never synced",
    synced: "synced {{ago}}",
  },
  bans: {
    title: "Banned accounts",
    hint: "{{email}} · banned {{banned}}",
    unban: "Unban",
    unbanFailed: "The ban wasn't lifted",
    note: "Sign-up refuses a banned account's email and its Google and GitHub accounts. Another Google or GitHub account with a new email gets through.",
  },
  cap: {
    label: "Account cap",
    hint_one:
      "{{accounts}} of {{count}} account, you included. Sign-ups stop at the cap; a lower cap removes no one. Leave empty to use the default, {{defaultMax}}.",
    hint_other:
      "{{accounts}} of {{count}} accounts, you included. Sign-ups stop at the cap; a lower cap removes no one. Leave empty to use the default, {{defaultMax}}.",
    saveFailed: "The cap didn't save",
    invalid: "Enter a whole number of 1 or more, or leave it empty",
  },
  server: {
    title: "Server",
    status: "Status",
    statusHint: "Not loaded yet. It loads when online.",
    database: "Database",
    databaseLarge:
      "Over 700 MB, about 4 GB of backups in R2. Lower quotas or the account cap, or remove accounts.",
    freeDisk: "Free disk",
    replica: "Replica",
    replicaHint: "Litestream, continuous. Stale after 1 hour.",
    dailyCopy: "Daily copy",
    dailyCopyHint: "The whole database, once a day. Stale after 2 days.",
    copyRehearsal: "Daily copy restore test",
    copyRehearsalHint:
      "Every day, the newest daily copy is downloaded, restored, and checked against the database. Stale after 2 days.",
    replicaRehearsal: "Replica restore test",
    replicaRehearsalHint:
      "Every day, the replica is restored and checked against the database. It must have every change from 30 seconds before. Stale after 2 days.",
    tokenCheck: "Backup token check",
    tokenCheckHint:
      "Every day, checks that the server's R2 tokens can't change the replica or open each other's bucket. Stale after 2 days.",
    backupStorage: "Backup storage",
    storageHint: "The DB copies in R2. The Litestream replica isn't counted.",
    storageHintGroups:
      "The DB copies in R2: {{groups}}. The Litestream replica isn't counted.",
    storageGroup: "{{objects}} {{prefix}} ({{bytes}})",
    otherGroup: "other",
    listFailed: "Couldn't list the bucket: {{error}}",
    unknown: "Unknown",
    off: "Off",
    never: "Never",
    stale: "Stale · {{value}}",
    failed: "Failed",
    lastRunFailed: "Last run failed: {{error}}",
  },
  user: {
    fields: {
      bytesPerDay: "Upload per day (MB)",
      maxBytes: "Storage (MB)",
      requestsPerMinute: "Requests per minute",
      snapshotsPerDay: "Full downloads per day",
    },
    saveFailed: "The change didn't save",
    created: "Created {{created}}. {{stored}} stored.",
    default: "Default {{value}}",
    invalidQuotas: "Enter numbers of 0 or more, or leave empty",
    saveQuotas: "Save quotas",
    disabledLabel: "Disabled",
    disable: "Disable",
    disabledHint: "Can't sign in or sync. The data stays on the server.",
    disableHint:
      "Signs the account out everywhere and refuses its sign-ins. The data stays.",
    enable: "Enable",
    delete: "Delete",
    deleteHint:
      "Deletes the account and all its data from the server, as the user's own deletion does. Backups keep it until they expire.",
    deleteAccount: "Delete account",
    confirmDeleteTitle: "Delete {{name}}?",
    confirmDeleteBody:
      "Everything the server holds for {{email}} is deleted now. This can't be undone; their devices keep their own data.",
    confirmDisableTitle: "Disable {{name}}?",
    confirmDisableBody:
      "Their devices are signed out and stop syncing. Their local data stays, and you can enable the account again.",
    ban: "Ban",
    banHint:
      "Deletes the account and all its data, as Delete does, and refuses its email and its Google and GitHub accounts at sign-up from then on.",
    banAccount: "Ban account",
    confirmBanTitle: "Ban {{name}}?",
    confirmBanBody:
      "Everything the server holds for {{email}} is deleted now. The server keeps only the name, email, and sign-in ids, to refuse them. Unbanning lets them sign up again, without their old data.",
  },
} as const;
