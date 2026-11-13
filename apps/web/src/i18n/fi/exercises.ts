import type { exercises as en } from "../en/exercises.ts";
import type { Messages } from "../messages.ts";

export const exercises = {
  list: {
    title: "Liikkeet",
    new: "Uusi",
    search: "Hae liikkeitä",
    noMatch: "Hakua vastaavia liikkeitä ei löytynyt.",
    createOne: "Luo uusi",
    archived: "Arkistoidut",
    hideArchived: "Piilota arkistoidut liikkeet",
    showArchived_one: "Näytä {{count}} arkistoitu liike",
    showArchived_other: "Näytä {{count}} arkistoitua liikettä",
    noMuscles: "Lihaksia ei valittu",
    sets_one: "{{count}} sarja",
    sets_other: "{{count}} sarjaa",
  },
  filter: {
    all: "Kaikki",
  },
  sort: {
    label: "Järjestä liikkeet",
    name: "Nimi",
    recent: "Viimeisin",
    most: "Eniten tehty",
  },
  picker: {
    alternatives: "Vaihtoehdot",
    sameMuscles: "Samat lihakset",
    allExercises: "Kaikki liikkeet",
    noMatch:
      "Hakua vastaavaa liikettä ei löytynyt. Voit luoda uuden Liikkeet-näkymässä.",
  },
  back: {
    toExercises: "Takaisin liikkeisiin",
    toHistory: "Takaisin historiaan",
    toLogging: "Takaisin kirjaukseen",
    toSession: "Takaisin treeniin",
  },
  editor: {
    exercise: "Liike",
    deleted: "Tämä liike on poistettu.",
    copyName: "{{name}} (kopio)",
    titleEdit: "Muokkaa liikettä",
    titleCopy: "Kopioi liike",
    titleNew: "Uusi liike",
    moreActions: "Lisää toimintoja",
    unarchive: "Palauta arkistosta",
    archive: "Arkistoi",
    copyAsNew: "Kopioi uudeksi",
    save: "Tallenna liike",
    create: "Luo liike",
    builtIn:
      "Sovelluksen mukana tuleva liike. Muokkauksesi säilyvät, kun sovelluksen liikelista päivittyy.",
    name: "Nimi",
    nameError: "Anna nimi.",
    namePlaceholder: "esim. Rintatuettu soutu",
    type: "Mitä sarjasta kirjataan",
    muscles: "Lihakset",
    musclesHint:
      "Napauta lihasta kerran, niin se on päälihas, kahdesti, niin se on apulihas, ja kolmesti, niin valinta poistuu. Valitse vähintään yksi päälihas.",
    restTime: "Tauon pituus",
    restTimeHint: "m:ss. Tyhjänä käytetään oletusta.",
    restTimeError: "Anna aika muodossa m:ss.",
    weightStep: "Painoaskel ({{unit}})",
    weightStepHint: "Tyhjänä käytetään oletusta.",
    weightStepError: "Anna nollaa suurempi luku.",
    defaultValue: "Oletus {{value}}",
    notes: "Muistiinpanot",
    notesPlaceholder: "Istuimen korkeus, ote, vinkit",
  },
} satisfies Messages<typeof en>;
