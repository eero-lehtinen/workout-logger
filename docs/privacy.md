# Data protection (GDPR)

How the deployed app meets the GDPR, and what keeps it that way. The
mechanics of accounts, export, and deletion are in
[accounts.md](accounts.md#privacy); this doc is the legal side: who is
responsible, what is processed and why, how requests and breaches are
handled, and what a change to the app must update.

The GDPR applies. Sign-up is open to anyone who finds the app, so the
household exemption (article 2(2)(c)) doesn't cover it, even though the app
is non-commercial and has a handful of users. This is the owner's own
reading of the regulation, not legal advice.

## Controller

The owner, a private person in Finland, is the controller. The notice shows
the controller's name and a contact address, which the web build takes from
`CONTACT_NAME` and `CONTACT_EMAIL`
([deployment.md](deployment.md#configuration)). The source names nobody, so
a build of someone else's server can't present this repository's owner as
its controller. CI refuses to build the deployed image without both; a
build without them, like a local one, says that they aren't set.

The supervisory authority is the Finnish Data Protection Ombudsman
(<https://tietosuoja.fi>).

Not needed: a data protection officer (article 37: no large-scale
processing) and an EU representative.

A data protection impact assessment (article 35) isn't needed either.
Screened against the criteria the Ombudsman lists, where two or more
usually mean an assessment, the processing meets two: the data can be
sensitive, and the people can include minors, since someone aged 13 to 17
may sign up. It doesn't evaluate or score people, decide anything
automatically, monitor anyone, combine datasets, use new technology, or keep
anyone from a service or a right, and it isn't large-scale (at most 100
accounts). The owner's conclusion is still that the risk isn't high, which
the guidance allows with reasons: the data is sets and reps the person
typed themselves, no other user sees it, nothing is published, profiled, or
sent to anyone, the app isn't aimed at minors, and the person can delete
everything at once. Screen again when one of these changes, e.g. shared
data, body measurements, or a feature for minors.

## What is processed

This table is the record of processing (article 30). The exemption for small
organisations doesn't apply, because workout data can be data concerning
health.

For someone without an account the server stores nothing: the app keeps its
data on the device. Their requests still pass the rate limiter, the last row
of the table.

| Data | Where | Purpose | Basis | Kept |
| --- | --- | --- | --- | --- |
| Name, email | `user` | Identify the account; show it in Settings and on the admin page | Needed for the account the person asked for, 6(1)(b) | Until the account is deleted |
| Profile picture URL | `user` | None: Better Auth stores it and no screen shows it | None of its own; a gap ([open-questions.md](open-questions.md)) | Until the account is deleted |
| Provider account id | `account` | Sign-in; recognise the same provider account | 6(1)(b) | Until the account is deleted |
| The provider's OAuth tokens, their expiry times, and scope | `account` | None: Better Auth stores them and the server never uses them | None of its own; a gap ([open-questions.md](open-questions.md)) | Until the account is deleted |
| Synced rows: routines, sessions, sets, notes, settings, with the sending device's id and the time received | `head`, `user_sync` | Sync between the person's devices | Explicit consent, 6(1)(a) and 9(2)(a) | Until the account is deleted |
| Per sign-in: session token and times; for a sign-in in a browser also the IP address and user agent. The Android app's session is created by the server itself and has neither | `session` | Keep the device signed in; trace misuse | Legitimate interest, 6(1)(f) | Until sign-out, or 60 days after the session was last renewed; expired rows are pruned daily (`prune-sessions`) |
| OAuth state of a sign-in that was started: no name or address, only random values | `verification` | Finish the sign-in | 6(1)(b) | Minutes; expired rows are pruned hourly |
| Bytes written and snapshot downloads per day; quota overrides | `usage`, `quota` | [Quotas](accounts.md#quotas) | Legitimate interest, 6(1)(f) | `usage` 90 days; `quota` until the account is deleted |
| A banned account's name, email, creation time, provider account ids | `ban`, `ban_key` | Refuse the same person at sign-up ([bans](accounts.md#bans)) | Legitimate interest, 6(1)(f) | Until the owner lifts the ban |
| All of the above, as copies of `app.db` | R2: `wl-litestream`, `wl-backups` | Disaster recovery ([backups.md](backups.md)) | Same as the copied data | By R2 lifecycle rule, counted from each object's creation: 5 days (`wl-litestream`; Litestream itself keeps 3), 7 days (daily), 90 days (monthly), 14 days (pre-migration). R2 removes an expired object within about a day |
| IP address per request, signed in or not | Server memory only | [Rate limits](accounts.md#rate-limits-and-request-hygiene) | Legitimate interest, 6(1)(f) | The server's limiter: its one-minute window and the one before it. Better Auth's limiter on `/api/auth/*` keeps an IP-and-path counter until a later auth request after its window clears it, or the server restarts |

The server writes no request log. Its container logs hold startup, job, and
error lines, rotated at 3 × 10 MB ([deployment.md](deployment.md#monitoring)).

On the device, the app stores its database, its preferences, the last known
account (name and email, to show offline), and on Android the session token
in secure storage. The only cookies are for signing in: the session cookie,
Better Auth's short-lived OAuth state cookie, and the 10-minute flow cookie
of an Android sign-in in its Custom Tab. None of it needs
consent under the ePrivacy rules: it is all needed for what the person asked
the app to do. There are no analytics, ads, third-party scripts, or fonts
loaded from another host.

## Consent

Sync is based on consent, because sets, notes, and later measurements can
say something about a person's health (article 9).

- The sign-in row in Settings has a checkbox, unchecked at first: "I consent
  to the server storing my workout data, which can say something about my
  health, as the privacy notice describes", with a link to the notice. The
  sign-in buttons are disabled until it is checked. Sign-in is also sign-up,
  and the row is the app's only way to either, so every account created
  through the app has passed it. A sign-in that expired asks again: the next
  one can be with another provider account. The answer is forgotten once a
  sign-in succeeds.
- Known limit: the consent is asked by the app and not recorded by the
  server. A request built by hand to `/api/auth/sign-in/social` signs up
  without it, and the proof of a given account's consent (article 7(1)) is
  that the app offers no other way, with the account's creation time, not a
  stored record ([open-questions.md](open-questions.md)).
- Withdrawing consent is deleting the account
  ([accounts.md](accounts.md#privacy)), in Settings or, for someone who
  can't sign in, by an email request. Signing out stops further uploads but
  leaves the stored data.
- Accounts are for people aged 13 or over, the age of consent for online
  services in Finland. The notice says so; the age isn't checked.

## Processors and transfers

| Who | Role | What it gets | Terms |
| --- | --- | --- | --- |
| Cloudflare | Processor: DNS, TLS, the Tunnel, R2 | Every request and response in clear text at its edge; the database copies in R2 | The Cloudflare DPA, part of the self-serve agreement. It covers transfers to the US with the EU–US Data Privacy Framework and the standard contractual clauses. |
| netcup GmbH, a German company; the server is in its data centre in Germany | Processor: the virtual server | The server's disk, with `app.db`. It stays in the EU | netcup's data processing agreement, which the customer creates in its Customer Control Panel: Master Data → Order Processing → Create AV Contract. Whether it has been created is in [open-questions.md](open-questions.md) |
| Google | Its own controller for sign-in | That the person signs in to this app, and when. It sends the name, email, picture, and account id. | Google's privacy policy; scopes `openid`, `email`, `profile` only |
| GitHub | Hosts the code, CI, and the APK | No user data. A phone downloading the APK connects to github.com. With `SIGN_IN_PROVIDERS=github` it has Google's role. | |

No one else receives personal data. The owner can read everything on the
server; there is no end-to-end encryption
([accounts.md](accounts.md#privacy)).

## Rights

| Right | How it is served |
| --- | --- |
| Information (13) | The notice at `/privacy`, linked from the sign-in row, Settings → About, and Google's consent screen |
| Access (15) and portability (20) | Settings → Export snapshot: a SQLite file of the device's synced data, which on a synced device is the account's ([backups.md](backups.md#snapshot-format)). Settings shows the name, email, and usage. Sign-in records and anything else: on request, with `server export-account` |
| Rectification (16) | Every logged row can be edited or deleted in the app. Name and email come from the provider; `server set-email` changes the email |
| Erasure (17) | Settings → Delete account, or the owner's admin page on request. Backups expire on the schedule above |
| Restriction (18), objection (21) | On request, decided case by case ([Requests](#requests)) |
| Withdrawing consent (7(3)) | Deleting the account |
| Complaint (77) | The notice names the Data Protection Ombudsman |

No decision about a person is automated.

## Requests

A request arrives by email at the controller's address. Answer within a
month (article 12(3)), free of charge.

1. Check that the sender is the account's person: the request comes from the
   account's email address, or they confirm from it.
2. Access: `node server/dist/cli.js export-account --user <id or email> --out <file>`
   in the `app` container ([deployment.md](deployment.md#the-server-command)).
   The JSON holds what the live database has: the account, its provider
   accounts, sign-in records, usage, quota overrides, any ban, and every
   synced row. It leaves out session and OAuth tokens, which are
   credentials. Backups aren't searched: say in the answer that copies of
   the same data, as it was, stay in backups for the periods in the notice.
   The file holds health-related data, so don't send it as a plain
   attachment: send it as an encrypted archive, with the password over
   another channel, and delete it from the container.
3. Erasure: delete the account on the admin page, and tell the person the
   backup periods in the notice; the last copy goes about three months
   later. A banned person's request also means lifting the ban, unless the
   ban is still needed against misuse; say which.
4. Correction of the email: `set-email`. Of the name: no command exists; it
   is one `UPDATE` of `user.name`.
5. Restriction, or an objection to the sign-in records or usage counts:
   weigh it against why the data is kept (article 21(1)). A restriction
   (article 18) means the data is only stored: disable the account on the
   admin page, which ends its sessions and refuses sync, and from then on
   don't open, export, change, or delete its data, except with the person's
   consent or for a legal claim. It stays in the database and so in the
   backups, which is storage. The daily `prune-usage` job still deletes
   the account's `usage` rows at 90 days: if the restriction is there to
   keep data the person needs, take an `export-account` file first and
   keep it for them. Note the restriction privately, since the
   server has no flag for it beyond `disabled`, and tell the person before
   enabling the account again (article 18(3)).
6. Note each erasure done on request, the account id and the date, in the
   owner's private notes until the last backup that can hold the account
   has expired, about three months. A whole-database restore
   ([deployment.md](deployment.md#recovery-procedures)) brings back
   accounts deleted after the restored copy was made, with their sessions:
   delete the noted ones again as the first thing after the restore. Known limit:
   accounts that their users deleted themselves are recorded nowhere, so
   they stay restored until the user deletes them again. A restore from the
   Litestream replica loses seconds, so this matters for a restore from a
   daily or monthly copy.

## Personal data breach

A breach is any loss, leak, or unauthorised access or change: a leaked R2
token or `AUTH_SECRET`, a compromised VPS or Cloudflare account, a bug that
serves one account's rows to another.

1. Contain it: rotate the exposed secret
   ([deployment.md](deployment.md#configuration)), and take the server
   offline if accounts' data is still exposed. Rotating `AUTH_SECRET` signs
   browsers out but not Android apps, whose bearer tokens end only when
   their `session` rows are deleted.
2. Write down what happened, when it was noticed, which accounts and which
   data, and what was done (article 33(5)), in the owner's private notes,
   not in this repository.
3. Unless the breach is unlikely to put anyone at risk, notify the Data
   Protection Ombudsman without undue delay, and within 72 hours of noticing
   it where feasible, with the form on <https://tietosuoja.fi>. A notice can
   be preliminary and completed later; one sent after 72 hours gives the
   reason for the delay.
4. If the risk to the people is high, e.g. their workout data or email
   addresses reached someone else, tell them without undue delay, by email
   to each account's address: what happened, the likely consequences, what
   has been done and what they should do, and whom to contact
   (article 34(2)).

## Keeping it compliant

The notice, the table above, and the server must describe the same thing.
A change that makes one of them wrong updates the others in the same
change, as with any doc.

| The change | Also do |
| --- | --- |
| A new server table or column with user data | Delete it in `deleteAccountRows` and assert it in `account-deletion.test.ts`; add it to `exportAccount` and its test; add a row to [What is processed](#what-is-processed); name it in the notice's "With an account" list |
| A new kind of synced data (measurements, Health Connect imports) | Name it in the notice's list of what is logged. If it is more plainly about health than sets and reps, name it in the consent text too |
| Anything that sends user data, or a user's request, to another company: analytics, error reporting, a CDN or web font, email sending, push notifications, another sign-in provider | Decide first whether it is needed at all. Then: its DPA, a row in [Processors and transfers](#processors-and-transfers), the notice's "Who else handles it". Enabling GitHub sign-in means naming GitHub where the notice names Google |
| A retention period: R2 lifecycle rules, Litestream's retention, the session length, usage pruning | The notice's "How long it is kept", `BackupRetention`, and the table |
| Logging | Keep emails, IP addresses, tokens, and row data out of logs. A request log would be new processing: a table row and a notice line |
| A cookie or device storage that the app doesn't need to work | Don't. It would need a consent banner |
| Using stored data for something new: statistics, contacting users | A legal basis for it, and the notice, before the code ships |
| Moving the server or the buckets | The processors table, and the notice if the data leaves the EU |
| Any change to the notice | Both languages; set `NOTICE_UPDATED`. If the server now stores more or shares it with someone new, existing accounts must be told, and asked again where the basis is consent |
| A new sign-in or sign-up path | It must pass the consent checkbox, or ask the same thing itself |

Rules that hold all the time:

- Test fixtures, issues, and PR text use synthetic data (AGENTS.md, Private data).
- Account deletion stays a hard delete, with `secure_delete` on.
- The scopes asked of Google stay `openid`, `email`, `profile`.

Once a year, and when the number of accounts grows past people the owner
knows:

- Read the notice against the table and the code.
- Check that the R2 lifecycle rules are still applied (`wrangler r2 bucket lifecycle list`, [deployment.md](deployment.md#r2-buckets)).
- Check that Cloudflare's DPA and its transfer basis still stand, and netcup's.
- Look through the admin page for accounts that shouldn't be there.
- Reconsider what "not needed at this scale" above assumes: a public launch, many accounts, or any commercial use changes it.

Undecided points are in [open-questions.md](open-questions.md).

## Running your own server

Whoever runs a server from this code is the controller of that server, and
the notice and this doc describe the owner's server, not theirs. Before
letting anyone sign in, replace:

- The controller: build with your own `CONTACT_NAME` and `CONTACT_EMAIL`.
- In `apps/web/src/i18n/en/privacy.ts` and `fi/privacy.ts`:
  - `controller.body`: "a private person in Finland".
  - `processors`: Cloudflare, netcup and Germany, and the transfer
    paragraph, with whoever hosts your server, carries its traffic, and
    stores its backups, and where.
  - `rights.complain`: the Finnish Ombudsman, and its link in
    `privacy-page.tsx`, with your supervisory authority.
  - `purpose.withdraw`: the age of 13, which is Finland's; it is 13 to 16
    depending on the country.
  - `withAccount.account` and `purpose.misuse`, if you enable a sign-in
    provider other than Google.
- The backup periods in `backup-retention.tsx`, if your buckets keep copies
  for other times than `deploy/r2/`.
- `NOTICE_UPDATED`.
- This doc: the tables under [What is processed](#what-is-processed) and
  [Processors and transfers](#processors-and-transfers), the authority, and
  the screening under [Controller](#controller), which is the owner's own
  judgment about the owner's own server.

The rest holds for any server running this code: what is stored, the
consent checkbox, export, deletion, and the pruning jobs.
