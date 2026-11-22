export const privacy = {
  title: "Privacy",
  updated: "Updated {{date}}.",
  controller: {
    title: "Who runs this",
    body: "{{name}}, a private person in Finland, runs this app and its server and is the controller of the personal data described here.",
    noName: "This build of the app doesn't say who runs its server.",
    contact: "Questions and requests: <mail>{{email}}</mail>.",
    noContact: "This build of the app has no contact address set.",
  },
  withoutAccount: {
    title: "Without an account",
    body: "Everything you log stays on this device. The server stores nothing about you. It only counts requests per IP address in its memory, for a short time, to limit traffic.",
  },
  withAccount: {
    title: "With an account",
    intro: "Signing in turns on sync. The server then stores:",
    account:
      "Your name, email address, profile picture address, and account id from Google, and the sign-in tokens Google issues with them.",
    data: "Everything you log in the app: routines, sessions, sets, notes, and settings.",
    signIns:
      "For each sign-in: when it was made and, when it was made in a browser, the IP address and the browser and system version.",
    usage:
      "How much data you upload each day, and how many times you download all of it.",
    encryption:
      "The connection is encrypted, but the data is not end-to-end encrypted: the person who runs the server can read it.",
  },
  purpose: {
    title: "Why, and on what basis",
    account:
      "Your name, email address, and Google account id are used to sign you in and to tell your account from others. The account you ask for can't work without them (GDPR article 6(1)(b)).",
    consent:
      "Your workout data is used only to sync your devices and to back up what they have synced. It can say something about your health, so the server stores it only with your consent, which you give when you sign in (articles 6(1)(a) and 9(2)(a)).",
    withdraw:
      "You can withdraw your consent at any time by deleting your account, or by asking by email if you can't sign in. That doesn't affect the lawfulness of what was done before. Accounts are for people aged 13 or over.",
    misuse:
      "Sign-in records and usage counts protect the server from misuse (legitimate interest, article 6(1)(f)). If the owner bans an account for misuse, the person's name, email address, and Google account id are kept to refuse a new sign-up, until the ban is lifted.",
  },
  processors: {
    title: "Who else handles it",
    body: "Google handles sign-in under its own privacy policy. It learns that you use this app, but gets none of your workout data. Cloudflare carries the traffic to the server and stores the server's backups. The server is a virtual server in Germany, rented from the hosting company netcup. Your data isn't sold or given to anyone else.",
    transfers:
      "Cloudflare is a US company and may handle data outside the EU. Its <dpa>data processing terms</dpa> cover that with the EU–US Data Privacy Framework and the EU's standard contractual clauses.",
  },
  retention: {
    title: "How long it is kept",
    account:
      "Your account and synced data: until you delete the account. Unused accounts aren't deleted.",
    signIns:
      "Sign-in records: until you sign out, or about 60 days after the sign-in was last used.",
    usage: "Usage counts: 90 days.",
    backups:
      "Backups made before a deletion still contain the deleted data until they are deleted:",
    continuous_one: "Continuous backup: deleted after {{count}} day",
    continuous_other: "Continuous backup: deleted after {{count}} days",
    daily_one: "Daily backups: deleted after {{count}} day",
    daily_other: "Daily backups: deleted after {{count}} days",
    monthly_one: "Monthly backups: deleted after {{count}} month",
    monthly_other: "Monthly backups: deleted after {{count}} months",
  },
  rights: {
    title: "Your rights",
    export:
      "A copy you can take elsewhere: <settings>Settings</settings> → Export snapshot saves the workout data on this device to a file.",
    correct:
      "Corrections: you can edit or delete anything you have logged. Your name and email address come from Google; ask if they need changing.",
    delete:
      "Deletion: Settings → Delete account deletes everything the server has for your account right away.",
    request:
      "By email to the address at the top you can also ask for a copy of everything the server holds about you, ask to have it corrected or deleted or its use restricted, and object to the sign-in records and usage counts being kept. You get an answer within a month.",
    complain:
      "If you think your data is handled wrongly, you can complain to the Data Protection Ombudsman in Finland (<site>tietosuoja.fi</site>) or to the data protection authority of your own country.",
  },
  cookies: {
    title: "Cookies and tracking",
    body: "There are no ads, analytics, or tracking. The only cookies are for signing in. The app keeps its data and settings on this device.",
  },
} as const;
