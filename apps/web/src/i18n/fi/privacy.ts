import type { privacy as en } from "../en/privacy.ts";
import type { Messages } from "../messages.ts";

export const privacy = {
  title: "Tietosuoja",
  updated: "Päivitetty {{date}}.",
  controller: {
    title: "Kuka tätä ylläpitää",
    body: "Sovellusta ja sen palvelinta ylläpitää yksityishenkilö {{name}} Suomessa. Hän on tässä kuvattujen henkilötietojen rekisterinpitäjä.",
    noName: "Tämä sovellusversio ei kerro, kuka sen palvelinta ylläpitää.",
    contact: "Kysymykset ja pyynnöt: <mail>{{email}}</mail>.",
    noContact: "Tähän sovellusversioon ei ole asetettu yhteysosoitetta.",
  },
  withoutAccount: {
    title: "Ilman tiliä",
    body: "Kaikki kirjaamasi pysyy tällä laitteella. Palvelin ei tallenna sinusta mitään. Se vain laskee pyyntöjä IP-osoitteittain muistissaan lyhyen aikaa liikenteen rajoittamiseksi.",
  },
  withAccount: {
    title: "Kun sinulla on tili",
    intro:
      "Kirjautuminen ottaa synkronoinnin käyttöön. Palvelin tallentaa silloin:",
    account:
      "Nimesi, sähköpostiosoitteesi, profiilikuvasi osoitteen ja tilisi tunnisteen Googlelta sekä Googlen niiden mukana antamat kirjautumistunnisteet.",
    data: "Kaiken, mitä kirjaat sovellukseen: ohjelmat, treenit, sarjat, muistiinpanot ja asetukset.",
    signIns:
      "Jokaisesta kirjautumisesta: ajankohdan sekä selaimella kirjauduttaessa IP-osoitteen ja selaimen ja käyttöjärjestelmän version.",
    usage:
      "Kuinka paljon tietoa lähetät päivässä ja kuinka monta kertaa lataat kaikki tietosi.",
    encryption:
      "Yhteys on salattu, mutta tietoja ei salata päästä päähän: palvelimen ylläpitäjä pystyy lukemaan ne.",
  },
  purpose: {
    title: "Miksi ja millä perusteella",
    account:
      "Nimeäsi, sähköpostiosoitettasi ja Google-tilisi tunnistetta käytetään kirjautumiseen ja tilisi erottamiseen muista. Pyytämäsi tili ei toimi ilman niitä (tietosuoja-asetuksen 6 artiklan 1 kohdan b alakohta).",
    consent:
      "Treenitietojasi käytetään vain laitteidesi synkronointiin ja synkronoitujen tietojen varmuuskopiointiin. Ne voivat kertoa jotain terveydestäsi, joten palvelin tallentaa ne vain suostumuksellasi, jonka annat kirjautuessasi (6 artiklan 1 kohdan a alakohta ja 9 artiklan 2 kohdan a alakohta).",
    withdraw:
      "Voit perua suostumuksesi milloin tahansa poistamalla tilisi tai pyytämällä sitä sähköpostitse, jos et pääse kirjautumaan. Peruminen ei vaikuta sitä ennen tehdyn käsittelyn lainmukaisuuteen. Tilin voi luoda 13 vuotta täyttänyt.",
    misuse:
      "Tiedot kirjautumisista ja käyttömäärät suojaavat palvelinta väärinkäytöltä (oikeutettu etu, 6 artiklan 1 kohdan f alakohta). Jos omistaja antaa tilille porttikiellon väärinkäytön takia, käyttäjän nimi, sähköpostiosoite ja Google-tilin tunniste säilytetään uuden rekisteröitymisen estämiseksi, kunnes porttikielto poistetaan.",
  },
  processors: {
    title: "Ketkä muut käsittelevät tietoja",
    body: "Google hoitaa kirjautumisen oman tietosuojakäytäntönsä mukaisesti. Se saa tietää, että käytät tätä sovellusta, mutta ei saa treenitietojasi. Cloudflare välittää liikenteen palvelimelle ja säilyttää palvelimen varmuuskopiot. Palvelin on Saksassa sijaitseva virtuaalipalvelin, joka on vuokrattu netcup-yhtiöltä. Tietojasi ei myydä eikä luovuteta kenellekään muulle.",
    transfers:
      "Cloudflare on yhdysvaltalainen yritys ja voi käsitellä tietoja EU:n ulkopuolella. Sen <dpa>tietojenkäsittelyehdot</dpa> kattavat tämän EU:n ja Yhdysvaltojen välisellä Data Privacy Framework -järjestelyllä ja EU:n vakiosopimuslausekkeilla.",
  },
  retention: {
    title: "Kuinka kauan tietoja säilytetään",
    account:
      "Tili ja synkronoidut tiedot: kunnes poistat tilin. Käyttämättömiä tilejä ei poisteta.",
    signIns:
      "Tiedot kirjautumisista: kunnes kirjaudut ulos, tai noin 60 päivää siitä, kun kirjautumista viimeksi käytettiin.",
    usage: "Käyttömäärät: 90 päivää.",
    backups:
      "Ennen poistoa tehdyissä varmuuskopioissa poistetut tiedot säilyvät, kunnes varmuuskopiot poistetaan:",
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
  rights: {
    title: "Oikeutesi",
    export:
      "Kopio, jonka voit siirtää muualle: <settings>Asetukset</settings> → Vie tilannevedos tallentaa tämän laitteen treenitiedot tiedostoon.",
    correct:
      "Oikaisu: voit muokata tai poistaa mitä tahansa kirjaamaasi. Nimesi ja sähköpostiosoitteesi tulevat Googlelta; pyydä, jos niitä pitää muuttaa.",
    delete:
      "Poisto: Asetukset → Poista tili poistaa palvelimelta heti kaiken, mitä tililläsi on.",
    request:
      "Sivun alussa olevaan osoitteeseen lähetetyllä sähköpostilla voit myös pyytää kopion kaikesta, mitä palvelimella on sinusta, pyytää tietojen oikaisua, poistoa tai käsittelyn rajoittamista sekä vastustaa kirjautumisia koskevien tietojen ja käyttömäärien säilyttämistä. Saat vastauksen kuukauden kuluessa.",
    complain:
      "Jos tietojasi käsitellään mielestäsi väärin, voit tehdä asiasta ilmoituksen tietosuojavaltuutetulle (<site>tietosuoja.fi</site>) tai oman maasi tietosuojaviranomaiselle.",
  },
  cookies: {
    title: "Evästeet ja seuranta",
    body: "Sovelluksessa ei ole mainoksia, analytiikkaa eikä seurantaa. Ainoat evästeet liittyvät kirjautumiseen. Sovellus säilyttää tietonsa ja asetuksensa tällä laitteella.",
  },
} satisfies Messages<typeof en>;
