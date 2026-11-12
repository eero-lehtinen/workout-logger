import type { privacy as en } from "../en/privacy.ts";
import type { Messages } from "../messages.ts";

export const privacy = {
  title: "Tietosuoja",
  withoutAccount: {
    title: "Ilman tiliä",
    body: "Tietosi pysyvät tällä laitteella. Palvelimelle ei lähetetä mitään.",
  },
  withAccount: {
    title: "Kun sinulla on tili",
    stored:
      "Palvelin tallentaa nimesi, sähköpostiosoitteesi ja Googlen profiilikuvasi sekä synkronoidut treenitietosi. Tietoja ei salata.",
    processors:
      "Google hoitaa kirjautumisen. Cloudflare välittää liikenteen palvelimelle ja säilyttää palvelimen varmuuskopiot. Tietojasi ei myydä eikä jaeta kenellekään muulle.",
  },
  yourData: {
    title: "Tietosi",
    export:
      "<settings>Asetukset</settings> → Vie tilannevedos tallentaa kaikki tietosi tiedostoon.",
    delete:
      "Asetukset → Poista tili poistaa palvelimelta kaiken, mitä tililläsi on. Vanhemmissa varmuuskopioissa tietosi säilyvät, kunnes varmuuskopiot poistetaan:",
  },
  retention: {
    continuous_one:
      "Jatkuva varmuuskopio: poistetaan {{count}} päivän kuluttua",
    continuous_other:
      "Jatkuva varmuuskopio: poistetaan {{count}} päivän kuluttua",
    daily_one:
      "Päivittäiset varmuuskopiot: poistetaan {{count}} päivän kuluttua",
    daily_other:
      "Päivittäiset varmuuskopiot: poistetaan {{count}} päivän kuluttua",
    monthly_one:
      "Kuukausittaiset varmuuskopiot: poistetaan {{count}} kuukauden kuluttua",
    monthly_other:
      "Kuukausittaiset varmuuskopiot: poistetaan {{count}} kuukauden kuluttua",
  },
} satisfies Messages<typeof en>;
