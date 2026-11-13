import type { ui as en } from "../en/ui.ts";
import type { Messages } from "../messages.ts";

export const ui = {
  toasts: {
    dismiss: "Sulje",
  },
  command: {
    undoFailed: "Ei voi kumota, koska jotain on muutettu sen jälkeen",
    saveFailed: "Tallennus epäonnistui",
  },
  stepper: {
    less: "Vähennä: {{label}}",
    more: "Lisää: {{label}}",
    inUnit: "yksikkönä {{unit}}",
  },
  chart: {
    showAll: "Näytä kaikki",
    trend: "Trendi {{rate}}",
    seriesTrend: "{{series}}: trendi {{rate}}",
    trendInRange: "{{trends}} näkyvällä aikavälillä",
    axisDay: "{d}. {MMM}",
  },
  appUpdate: {
    available: "Versio {{version}} on saatavilla",
    download: "Lataa",
    downloadFailed: "Latauksen aloitus epäonnistui",
  },
  errors: {
    serverAnswered: "Palvelin vastasi {{status}}",
  },
  account: {
    signInFailed: "Kirjautuminen epäonnistui",
    signInUnfinished: "Kirjautuminen jäi kesken",
    signupClosed: "Uusia tilejä ei voi juuri nyt luoda.",
    accountDisabled: "Tämä tili on poistettu käytöstä.",
    welcomeTitle: "Tervetuloa",
    welcomeText:
      "Tilisi on valmis. Tällä laitteella kirjaamasi tiedot siirtyvät palvelimelle ensimmäisessä synkronoinnissa.",
  },
  sync: {
    savedFirstTitle: "Tämän laitteen tiedoista tallennettiin tilannevedos",
    notDiscardedTitle: "Mitään ei hylätty",
    snapshotFailed:
      "Tilannevedosta ei voitu tallentaa, joten tämän laitteen tietoja ei hylätty: {{reason}}",
  },
  backupWarning: {
    unsynced: "Muutokset eivät ole synkronoituneet päiviin",
    backupStale: "Palvelimen varmuuskopio on vanhentunut",
    restoreFailed: "Palvelimen varmuuskopion palautustesti epäonnistui",
    databaseLarge: "Palvelimen tietokanta on yli 700 Mt",
  },
  restTimer: {
    failedTitle: "Taukoajastin ei käynnistynyt",
    failedText: "Android käynnistää sen vain, kun sovellus on auki.",
  },
} satisfies Messages<typeof en>;
