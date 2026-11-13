import type { shell as en } from "../en/shell.ts";
import type { Messages } from "../messages.ts";

export const shell = {
  appName: "Workout Logger",
  mainNav: "Päävalikko",
  nav: {
    today: "Tänään",
    history: "Historia",
    routines: "Ohjelmat",
    exercises: "Liikkeet",
    settings: "Asetukset",
  },
  sessionRunning: "Treeni käynnissä",
  notFound: "Tätä sivua ei ole.",
  gate: {
    opening: "Avataan treenilokia…",
    elsewhereTitle: "Auki toisessa välilehdessä",
    elsewhereText:
      "Treeniloki voi olla auki vain yhdessä välilehdessä kerrallaan. Jos käytät sitä tässä, se suljetaan toisesta välilehdestä.",
    useHere: "Käytä tässä",
    blockedTitle: "Yhä auki toisessa ikkunassa",
    blockedText:
      "Selain on keskeyttänyt toisen ikkunan, joten se ei vielä pysty vapauttamaan treenilokia. Siirry siihen tai sulje se; tämä avautuu sen jälkeen itsestään.",
    tooNewTitle: "Päivitä sovellus",
    tooNewUpdate:
      "Tietosi on tallennettu uudemmalla sovellusversiolla. Päivitä sovellus, niin voit avata ne.",
    tooNewReload:
      "Tietosi on tallennettu uudemmalla sovellusversiolla. Lataa sivu uudelleen, niin voit avata ne.",
    failedTitle: "Treeniloki ei auennut",
    failedText:
      "Tietosi ovat ennallaan. Yritä uudelleen tai lataa sovellus uudelleen.",
  },
} satisfies Messages<typeof en>;
