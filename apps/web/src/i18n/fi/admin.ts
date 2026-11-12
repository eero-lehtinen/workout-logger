import type { admin as en } from "../en/admin.ts";
import type { Messages } from "../messages.ts";

export const admin = {
  title: "Ylläpito",
  ownerOnly: "Vain omistaja näkee tämän sivun.",
  loading: "Ladataan…",
  accounts: {
    title: "Tilit",
    loadFailed: "Tilejä ei voitu ladata: {{error}}",
    searchPlaceholder: "Hae nimellä tai sähköpostilla",
    searchLabel: "Hae tilejä",
    noMatch: "Hakua vastaavaa tiliä ei löytynyt.",
    owner: "omistaja",
    disabled: "poistettu käytöstä",
    usage: "{{stored}} tallessa · {{today}} tänään · {{synced}}",
    usageOf: "{{used}} / {{limit}}",
    neverSynced: "ei koskaan synkronoitu",
    synced: "synkronoitu {{ago}}",
  },
  cap: {
    label: "Tilien enimmäismäärä",
    hint_one:
      "{{accounts}} / {{count}} tili, sinä mukaan lukien. Uusia tilejä ei voi luoda, kun enimmäismäärä on täynnä; sen pienentäminen ei poista ketään. Tyhjänä {{defaultMax}}.",
    hint_other:
      "{{accounts}} / {{count}} tiliä, sinä mukaan lukien. Uusia tilejä ei voi luoda, kun enimmäismäärä on täynnä; sen pienentäminen ei poista ketään. Tyhjänä {{defaultMax}}.",
    saveFailed: "Enimmäismäärää ei voitu tallentaa",
    invalid: "Anna kokonaisluku, joka on vähintään 1, tai jätä kenttä tyhjäksi",
  },
  server: {
    title: "Palvelin",
    status: "Tila",
    statusHint: "Ei vielä ladattu. Tiedot latautuvat, kun laite on verkossa.",
    database: "Tietokanta",
    databaseLarge:
      "Yli 700 Mt, eli noin 4 Gt varmuuskopioita R2:ssa. Pienennä kiintiöitä tai tilien enimmäismäärää, tai poista tilejä.",
    freeDisk: "Vapaa levytila",
    replica: "Replika",
    replicaHint: "Litestream, jatkuva. Vanhentunut, jos yli tunnin vanha.",
    dailyCopy: "Päivittäinen kopio",
    dailyCopyHint:
      "Koko tietokanta kerran päivässä. Vanhentunut, jos yli 2 päivää vanha.",
    backupStorage: "Varmuuskopioiden tallennustila",
    storageHint:
      "Tietokannan kopiot R2:ssa. Litestream-replikaa ei lasketa mukaan.",
    storageHintGroups:
      "Tietokannan kopiot R2:ssa: {{groups}}. Litestream-replikaa ei lasketa mukaan.",
    storageGroup: "{{objects}} {{prefix}} ({{bytes}})",
    otherGroup: "muut",
    listFailed: "Säilön sisältöä ei voitu listata: {{error}}",
    unknown: "Tuntematon",
    off: "Pois käytöstä",
    never: "Ei koskaan",
    stale: "Vanhentunut · {{value}}",
    lastRunFailed: "Viimeisin ajo epäonnistui: {{error}}",
  },
  user: {
    fields: {
      bytesPerDay: "Lähetys päivässä (Mt)",
      maxBytes: "Tallennustila (Mt)",
      requestsPerMinute: "Pyyntöjä minuutissa",
      snapshotsPerDay: "Kokonaisia latauksia päivässä",
    },
    saveFailed: "Muutosta ei voitu tallentaa",
    created: "Luotu {{created}}. {{stored}} tallessa.",
    default: "Oletus {{value}}",
    invalidQuotas:
      "Anna lukuja, jotka ovat vähintään 0, tai jätä kenttä tyhjäksi",
    saveQuotas: "Tallenna kiintiöt",
    unlimited: "Rajoittamaton lähetys",
    unlimitedHint:
      "Poistaa päivittäisen lähetysrajan 24 tunniksi, esim. ennen tuontia. Tallennustilan raja pysyy.",
    unlimitedActive: "Päivittäistä lähetysrajaa ei ole {{until}} asti.",
    allow24h: "Salli 24 tunniksi",
    disabledLabel: "Poistettu käytöstä",
    disable: "Poista käytöstä",
    disabledHint:
      "Ei voi kirjautua sisään eikä synkronoida. Tiedot pysyvät palvelimella.",
    disableHint:
      "Kirjaa tilin ulos kaikkialta ja estää kirjautumisen. Tiedot säilyvät.",
    enable: "Ota käyttöön",
    delete: "Poista",
    deleteHint:
      "Poistaa tilin ja kaikki sen tiedot palvelimelta, samoin kuin käyttäjän itse tekemä poisto. Tiedot säilyvät varmuuskopioissa, kunnes ne vanhenevat.",
    deleteAccount: "Poista tili",
    confirmDeleteTitle: "Poistetaanko {{name}}?",
    confirmDeleteBody:
      "Kaikki palvelimella olevat käyttäjän {{email}} tiedot poistetaan nyt. Tätä ei voi perua. Käyttäjän laitteet säilyttävät omat tietonsa.",
    confirmDisableTitle: "Poistetaanko {{name}} käytöstä?",
    confirmDisableBody:
      "Käyttäjän laitteet kirjataan ulos, eivätkä ne enää synkronoi. Laitteiden tiedot säilyvät, ja voit ottaa tilin myöhemmin uudelleen käyttöön.",
  },
} satisfies Messages<typeof en>;
