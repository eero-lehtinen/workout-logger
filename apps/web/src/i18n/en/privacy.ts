export const privacy = {
  title: "Privacy",
  withoutAccount: {
    title: "Without an account",
    body: "Your data stays on this device. Nothing is sent to the server.",
  },
  withAccount: {
    title: "With an account",
    stored:
      "The server stores your name, email address, and profile picture from Google, and your synced workout data. It is not encrypted.",
    processors:
      "Google handles sign-in. Cloudflare carries traffic to the server and stores the server's backups. Your data isn't sold or shared with anyone else.",
  },
  yourData: {
    title: "Your data",
    export:
      "<settings>Settings</settings> → Export snapshot saves all your data to a file.",
    delete:
      "Settings → Delete account deletes everything the server has for your account. Older backups still contain your data until they are deleted:",
  },
  retention: {
    continuous_one: "Continuous backup: deleted after {{count}} day",
    continuous_other: "Continuous backup: deleted after {{count}} days",
    daily_one: "Daily backups: deleted after {{count}} day",
    daily_other: "Daily backups: deleted after {{count}} days",
    monthly_one: "Monthly backups: deleted after {{count}} month",
    monthly_other: "Monthly backups: deleted after {{count}} months",
  },
} as const;
