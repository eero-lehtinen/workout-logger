import type { settings as en } from "../en/settings.ts";
import type { Messages } from "../messages.ts";

export const settings = {
  title: "Asetukset",
  units: {
    title: "Yksiköt ja painoaskel",
    weightUnit: "Painoyksikkö",
    weightStep: "Painoaskel",
    weightStepWithUnit: "Painoaskel ({{unit}})",
    weightStepHint:
      "Paljonko +/− muuttaa painoa, ellei liikkeelle ole asetettu omaa.",
  },
  timers: {
    title: "Ajastimet",
    restTimer: "Taukoajastin",
    restTimerHint: "Käynnistyy aina, kun kirjaat sarjan.",
    restTime: "Tauon pituus",
    restTimeHint: "m:ss. Liikkeelle voi asettaa oman.",
    alertVolume: "Merkkiäänen voimakkuus",
    alertVolumeHintNative: "Suhteessa puhelimen median äänenvoimakkuuteen.",
    alertVolumeHintWeb: "Ääni, joka soi tauon lopussa.",
    sessionTimer: "Treeniajastin",
    sessionTimerHint:
      "Näyttää, kuinka kauan käynnissä oleva treeni on kestänyt.",
    idleEnd: "Automaattinen lopetus (min)",
    idleEndLabel: "Automaattinen lopetus minuutteina",
    idleEndHint:
      "Jos sarjaa ei kirjata näin pitkään, treeni päättyy. Lopetusajaksi tulee viimeisen sarjan aika.",
  },
  sessions: {
    title: "Treenit",
    keepScreenOn: "Pidä näyttö päällä",
    keepScreenOnHint: "Kun treeni on käynnissä.",
    repLimit: "e1RM-toistoraja",
    repLimitHint:
      "Jos toistoja on tätä enemmän, sarjalle ei lasketa e1RM:ää eikä se voi olla ennätys.",
    weekStart: "Viikon ensimmäinen päivä",
    weekStartHint:
      "Kalenterin ensimmäinen sarake ja päivä, josta viikkotilastot alkavat.",
    monday: "ma",
    sunday: "su",
  },
  appearance: {
    title: "Ulkoasu",
    theme: "Teema",
    themeHint: "Vain tällä laitteella.",
    themeSystem: "Järjestelmä",
    themeLight: "Vaalea",
    themeDark: "Tumma",
    language: "Kieli",
    languageHint: "Vain tällä laitteella.",
    languageSystem: "Järjestelmä",
  },
  account: {
    title: "Tili ja synkronointi",
    signedOut: "Kirjautuminen päättyi",
    sync: "Synkronointi",
    expiredHint:
      "Kirjautumisesi on vanhentunut. Kirjaudu uudelleen, niin synkronointi jatkuu. Tällä laitteella kirjatut tiedot säilyvät.",
    signInHint:
      "Kirjaudu, niin voit synkronoida laitteesi. Synkronoituja tietoja ei salata. <privacy>Tietosuoja</privacy>",
    signIn: "Kirjaudu sisään",
    signInWith: "Kirjaudu sisään {{provider}}-tilillä",
    signInFailed: "Kirjautumista ei voitu aloittaa",
    emailOffline: "{{email}} · ei verkkoyhteyttä",
    clockAhead: "Kello on edellä",
    clockAheadHint:
      "Laitteen kello oli edellä, kun kirjasit joitakin muutoksia, joten palvelin hylkäsi ne. Aseta laitteen aika oikein ja valitse sitten Korjaa kello.",
    repairClock: "Korjaa kello",
    signOut: "Kirjaudu ulos",
    signOutSynced:
      "Tietosi pysyvät tällä laitteella. Synkronointi on pois päältä, kunnes kirjaudut uudelleen.",
    signOutUnsynced_one:
      "Tietosi pysyvät tällä laitteella, mutta {{count}} synkronoimaton muutos ei päädy muille laitteillesi, ennen kuin kirjaudut uudelleen.",
    signOutUnsynced_other:
      "Tietosi pysyvät tällä laitteella, mutta {{count}} synkronoimatonta muutosta ei päädy muille laitteillesi, ennen kuin kirjaudut uudelleen.",
    admin: "Ylläpito",
    adminHint: "Palvelimen tallennustila ja varmuuskopiot, tilit ja kiintiöt.",
    open: "Avaa",
    choice: {
      title: "Tällä laitteella on toisen tilin tietoja",
      description:
        "Yhdistä lisää ne tilille, jolle kirjauduit. Hylkää tallentaa ne tilannevedostiedostoon, poistaa ne tältä laitteelta ja lataa tilalle tämän tilin tiedot. Toisella tilillä säilyy se, minkä se ehti synkronoida.",
      unsynced_one:
        "{{count}} täällä tehty muutos ei koskaan päätynyt palvelimelle. Hylkäämisen jälkeen se on tallessa vain tuossa tiedostossa.",
      unsynced_other:
        "{{count}} täällä tehtyä muutosta ei koskaan päätynyt palvelimelle. Hylkäämisen jälkeen ne ovat tallessa vain tuossa tiedostossa.",
      merge: "Yhdistä",
      discard: "Hylkää tämän laitteen tiedot",
      signOut: "Kirjaudu ulos",
    },
  },
  sync: {
    label: "Synkronointi",
    now: "Synkronoi nyt",
    syncing: "Synkronoidaan…",
    notYet: "Ei vielä synkronoitu.",
    synced: "Synkronoitu {{ago}}.",
    pending_one: "{{count}} muutos odottaa synkronointia.",
    pending_other: "{{count}} muutosta odottaa synkronointia.",
    problem: {
      accountDisabled:
        "Tilisi on poistettu käytöstä. Tietosi pysyvät tällä laitteella, ja synkronointi jatkuu, jos omistaja ottaa tilin taas käyttöön.",
      updateRequired: "Päivitä sovellus, niin synkronointi jatkuu.",
      offline:
        "Ei verkkoyhteyttä. Synkronointi jatkuu, kun palvelin on taas tavoitettavissa.",
      server:
        "Viimeisin synkronointi epäonnistui. Sitä yritetään uudelleen minuutin välein.",
      rateLimited:
        "Palvelimelle tehtiin liikaa pyyntöjä. Synkronointia yritetään uudelleen minuutin kuluttua.",
      downloadQuota:
        "Synkronointi on keskeytetty, koska tämä laite on ladannut kaikki tiedot liian monta kertaa tänään. Se jatkuu huomenna.",
      storageFull:
        "Synkronointi on keskeytetty, koska tallennustilasi palvelimella on täynnä. Pyydä omistajalta lisää.",
      uploadLimit:
        "Synkronointi on keskeytetty, koska päivän lähetysraja on täynnä. Se jatkuu huomenna.",
      refused:
        "Palvelin hylkäsi joitakin muutoksia. Ne pysyvät tällä laitteella.",
    },
    usage: {
      label: "Tallennustila palvelimella",
      stored: "Tallennettu: {{value}}",
      uploadedToday: "Lähetetty tänään: {{value}}",
      of: "{{used}} / {{limit}}",
    },
  },
  data: {
    title: "Tiedot",
    exportSnapshot: "Vie tilannevedos",
    exportHintNative:
      "Tallentaa kaikki tietosi yhteen tiedostoon kansioon Documents/{{folder}}.",
    exportHintWeb:
      "Lataa kaikki tietosi yhtenä tiedostona. Säilytä se turvallisessa paikassa.",
    export: "Vie",
    snapshotSaved: "Tilannevedos tallennettu",
    exportFailed: "Vienti epäonnistui",
    importSnapshot: "Tuo tilannevedos",
    importHint: "Tästä sovelluksesta viedystä tiedostosta.",
    import: "Tuo",
    importChoice:
      "Yhdistä säilyttää kaikesta uudemman version. Korvaa tallentaa ensin nykyiset tietosi tilannevedokseksi ja tekee sitten tiedoistasi täsmälleen tuodun tiedoston mukaiset.",
    merge: "Yhdistä",
    replaceEverything: "Korvaa kaikki",
    imported: "Tilannevedos tuotu",
    importedMerge_one: "{{count}} kohde päivitettiin tiedostosta.",
    importedMerge_other: "{{count}} kohdetta päivitettiin tiedostosta.",
    importedReplace: "{{written}} kohdetta päivitetty, {{deleted}} poistettu.",
    undoFailed: "Ei voi kumota, koska jotain on muutettu sen jälkeen",
    undoFailedHint:
      "Palaa entiseen tuomalla tilannevedos, joka tallennettiin ennen korvaamista.",
    importFailed: "Tuonti epäonnistui",
    savedFirst: "Nykyiset tietosi tallennettiin ensin",
    notReplaced: "Mitään ei korvattu",
    saveFirstFailed: "Nykyisiä tietojasi ei voitu tallentaa ensin: {{error}}",
    autoSnapshots: "Automaattiset tilannevedokset",
    autoSnapshotsNone:
      "Tallennetaan kansioon Documents/{{folder}} jokaisen treenin jälkeen, ja 10 uusinta säilytetään. Yhtään ei ole vielä tallennettu.",
    autoSnapshotsLast:
      "Tallennetaan kansioon Documents/{{folder}} jokaisen treenin jälkeen, ja 10 uusinta säilytetään. Viimeisin: {{time}}.",
    autoSnapshotFailed: "Tilannevedostiedostoa ei voitu tallentaa",
    install: "Asenna sovellus",
    installHintAvailable:
      "Avautuu aloitusnäytöltä tai työpöydältä, toimii ilman verkkoyhteyttä, eikä selain tyhjennä tietojasi.",
    installHintManual:
      "Asenna selaimen valikosta. iPhonessa: Jaa, sitten Lisää Koti-valikkoon.",
    installButton: "Asenna",
    storage: "Tallennustila",
    storageUnknown:
      "Tämä selain ei kerro, onko tietosi suojattu automaattiselta tyhjennykseltä.",
    storageProtected:
      "Suojattu: selain ei tyhjennä tietojasi vapauttaakseen tilaa.",
    storageUnprotected:
      "Ei suojattu: selain voi tyhjentää tietosi, jos tila käy vähiin. Sovelluksen asentaminen yleensä suojaa ne. Siihen asti vie tilannevedos säännöllisesti.",
    askBrowser: "Kysy selaimelta",
    askBrowserDenied: "Selain ei sallinut sitä",
    askBrowserDeniedHint:
      "Chrome päättää itse, yleensä vasta kun sovellus on asennettu. Sovellus kysyy uudelleen, kun asennat sen.",
    androidApp: "Android-sovellus",
    androidAppHint:
      "Versio {{version}}. Sen taukoajastin hälyttää myös taustalla. Sovelluksella on omat tietonsa, joten siirrä tietosi sinne tilannevedoksella.",
    download: "Lataa",
  },
  about: {
    title: "Tietoja",
    webBuild: "Verkkosovelluksen koontiversio",
    webBuildCommit: "{{commit}}",
    webBuildCommitTime: "{{commit}}, koottu {{time}}",
    unknownCommit: "Tuntematon commit",
    privacy: "Tietosuoja",
    privacyHint: "Mitä palvelin tallentaa ja kuinka pitkään.",
    openPrivacy: "Avaa tietosuojasivu",
    open: "Avaa",
    version: "Versio",
    versionHint:
      "{{version}}. Päivitykset tarkistetaan myös, kun sovellus käynnistyy.",
    checkForUpdates: "Tarkista päivitykset",
    updateAvailable: "Versio {{version}} on saatavilla",
    download: "Lataa",
    updateDownloaded: "Päivitys on ladattu",
    updateDownloadedHint:
      "Päivitys otetaan käyttöön, kun poistut sovelluksesta.",
    upToDate: "Sovellus on ajan tasalla",
    checkFailed: "Päivityksiä ei voitu tarkistaa",
  },
  deleteAccount: {
    label: "Poista tili",
    hint: "Poistaa tietosi palvelimelta. Tämä laite säilyttää oman kopionsa.",
    body: "Palvelin poistaa tilisi ja kaikki treenitietosi heti. Muut laitteesi lopettavat synkronoinnin. Tämä laite säilyttää tietonsa ja kirjautuu ulos.",
    backups:
      "Vanhemmissa varmuuskopioissa tietosi säilyvät, kunnes varmuuskopiot poistetaan:",
    keepCopy: "Ota ensin kopio tiedoistasi.",
    typeEmail: "Vahvista kirjoittamalla {{email}}",
    deleted: "Tili poistettu",
    deletedHint: "Tämä laite säilyttää tietonsa eikä enää synkronoi.",
    failed: "Tiliä ei poistettu",
  },
} satisfies Messages<typeof en>;
