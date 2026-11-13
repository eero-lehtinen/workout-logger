# Translations

The web app's UI is in English and Finnish. Every user-visible string,
including `aria-label`s, toasts, confirm dialogs, and chart labels, comes
from the message files; none is written inline in components.

## Language choice

The language is a view preference of the device (`language` in
`localStorage`: `system`, `en`, or `fi`), like the theme, not a synced
setting: it must apply before the database opens, since the screens shown
before that are translated too. `system` takes the first of the browser's
languages that the app has, and English otherwise. Settings → Appearance
switches it; the current screen remounts so every formatted value updates.

Dates and numbers follow the UI language, not the device locale alone
(`formatLocale` in `apps/web/src/i18n/index.ts`): the device's own locale
when it speaks the UI language, so `en-US` keeps its 12-hour clock;
otherwise `en-GB` or `fi-FI`. An English UI on a Finnish phone therefore
shows English month names, and a Finnish UI uses the decimal comma.
Charts pass ECharts a locale for the language; the Finnish one takes its
month and weekday names from `Intl` (`components/chart/locale.ts`).

## What is not translated

- Exercise names, built-in routine and day names, and metric names. They are
  catalog data written into synced rows, which the user can rename.
- The app's name.
- Server responses and the Android notification texts (the `RestTimer`
  plugin), which would need an APK release.

Muscle and muscle group names are translated: the muscle list is fixed, and
the UI looks the name up by the muscle's key (`muscleName`,
`muscleGroupName` in `features/exercises/muscles.ts`).

## Code

Library: i18next with react-i18next. Messages are TypeScript objects in
`apps/web/src/i18n/en/<area>.ts` and `fi/<area>.ts`, combined in each
`index.ts`. English is the source: it is declared `as const`, and i18next's
types check every key, plural `count`, and interpolation variable against
it. Each Finnish file `satisfies Messages<typeof en>`, so a missing or extra
key fails `pnpm typecheck`.

- Areas follow the feature folders (`session`, `history`, `exercises`,
  `routines`, `settings`, `admin`, `privacy`), plus `shell` (app shell, the
  database gate), `ui` (shared components and messages raised in `lib/`),
  `format` (`lib/format.ts`), `muscles`, and `common` (actions used on many
  screens: Save, Cancel, Delete, Undo).
- Every message change edits both languages in the same change, so that
  they mean the same thing. The type check only catches missing keys, not a
  Finnish text left describing the old wording. When a label is reworded,
  its hint, `aria-label` variant, and related messages are checked too.
- Keys are camelCase and nested by screen or component, e.g.
  `session.log.addSet`. A key names what the text is for, not its wording.
- In components and hooks, `const { t } = useTranslation()`. Outside React
  (toasts raised in `lib/`, helpers), `i18n.t` from `i18n/index.ts`, called
  when the text is shown, never at module load. An `i18n.t` call in render
  is cached by the React Compiler when it has no changing inputs; that is
  harmless inside a screen, which remounts on a language change, but not in
  the app shell, its badges, and the toast layer, which use `t`.
- Lists of options with labels keep a key per option and translate at
  render; a module-level array of English labels is not allowed.
- Counts use plurals: `sets_one` and `sets_other`, called as
  `t("…sets", { count })`. Finnish has the same two forms.
- Whole sentences go in one message, with `{{variables}}`; never glue
  translated fragments together, since word order differs. Text with a link
  or emphasis inside uses `<Trans>` with named components
  (`"Read the <privacy>privacy page</privacy>."`). Don't name a tag after an
  HTML void element (`link`, `br`, `img`): `Trans` renders it without its
  children.
- Names the app generates for new rows are UI text: the UI translates them
  and passes them to the command, e.g. a duplicated routine's
  "Upper/Lower (copy)". `core` never holds UI text.
- Dates and numbers: `dateFormat(options)` and `numberFormat(options)` from
  `lib/format.ts`, called in render. They cache a formatter per locale; a
  module-level `Intl` formatter would keep the language it was created in.
  Weights use `formatWeight` from `lib/format.ts`, not core's, so the
  decimal separator follows the language.
- Stories run in English unless they pass `language: "fi"` to `pageStory`;
  each feature has at least one Finnish story, which catches text that
  doesn't fit. Storybook's toolbar switches the language for browsing.

## Wording

UI text is written for someone who has not read the docs. A setting or
action is labeled by what it does, and its hint says when it happens and
what changes as a result: "Auto-end after (min)", with "If no set is logged
for this long, the session ends. Its end time is the last set."

UI wording is independent of code. Each glossary term has a UI word in each
language, listed under [UI terms](#ui-terms); usually it is the glossary
term itself. To reword, change the messages and the table, not the code or
the glossary. Every message uses the table's word for a concept, so the UI
stays consistent with itself.

## Finnish

Informal, as Finnish apps are: second person singular, short imperatives
("Aloita treeni", "Tallenna"). Sentence case. Weekday abbreviations are
lowercase (`ma`, `su`).

Write each message as a Finnish app would phrase it, not as a word-for-word
rendering of the English. Keep the meaning and the information, and change
the structure freely: Finnish often fits a case ending where English needs a
preposition, and an English noun phrase often reads better as a Finnish
verb. If the English itself is unclear, fix it instead of translating it.
Read the result in context, in a Finnish story, to check that it fits and
sounds natural.

## UI terms

The words the UI uses for each [glossary](glossary.md) term:

| Glossary term | English UI | Finnish UI |
| --- | --- | --- |
| session | session | treeni |
| start / end a session | start / end a session | aloita / lopeta treeni |
| exercise | exercise | liike |
| exercise type | exercise type | liiketyyppi |
| routine | routine | ohjelma |
| built-in routine | built-in routine | valmisohjelma |
| workout day, day | workout day, day | treenipäivä, päivä |
| cycle | cycle | kierto |
| slot | slot | liikepaikka |
| alternative | alternative | vaihtoehto |
| substitution, substitute | substitution, substitute | korvaava liike, vaihda liike |
| set | set | sarja |
| rep | rep | toisto |
| weight | weight | paino |
| previous performance | previous performance | edellinen kerta |
| reference set | reference set | vertailusarja |
| PR | PR | ennätys |
| set record | set record | sarjaennätys |
| weight increase | weight increase | painonnousu |
| e1RM | e1RM | e1RM |
| weight unit | weight unit | painoyksikkö |
| weight step | weight step | painoaskel |
| weighted sets | weighted sets | painotetut sarjat |
| muscle, muscle group | muscle, muscle group | lihas, lihasryhmä |
| primary muscle | primary muscle | päälihas |
| muscle target | muscle target | kohdelihas |
| metric | metric | mittari |
| measurement | measurement | mittaus |
| body weight | body weight | kehonpaino |
| rest, rest time | rest, rest time | tauko, tauon pituus |
| rest timer | rest timer | taukoajastin |
| session timer | session timer | treeniajastin |
| idle end | auto-end | automaattinen lopetus |
| history | history | historia |
| records | records | ennätykset |
| notes | notes | muistiinpanot |
| snapshot | snapshot | tilannevedos |
| backup | backup | varmuuskopio |
| sync | sync | synkronointi, synkronoida |
| server | server | palvelin |
| device | device | laite |
| account | account | tili |
| owner | owner | omistaja |
| account cap | account cap | tilien enimmäismäärä |
| quota | quota | kiintiö |
| disabled account | disabled account | käytöstä poistettu tili |
| sign in / out | sign in / out | kirjaudu sisään / ulos |
| archive | archive | arkistoi |
| undo | undo | kumoa |
