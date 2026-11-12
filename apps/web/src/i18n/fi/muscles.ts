import type { muscles as en } from "../en/muscles.ts";
import type { Messages } from "../messages.ts";

export const muscles = {
  names: {
    chest: "Rinta",
    lats: "Leveät selkälihakset",
    upper_back: "Yläselkä",
    traps: "Epäkkäät",
    lower_back: "Alaselkä",
    front_delts: "Etuolkapäät",
    side_delts: "Sivuolkapäät",
    rear_delts: "Takaolkapäät",
    biceps: "Hauikset",
    triceps: "Ojentajat",
    forearms: "Kyynärvarret",
    quads: "Etureidet",
    hamstrings: "Takareidet",
    glutes: "Pakarat",
    adductors: "Lähentäjät",
    abductors: "Loitontajat",
    calves: "Pohkeet",
    abs: "Vatsat",
    obliques: "Vinot vatsalihakset",
  },
  groups: {
    Chest: "Rinta",
    Back: "Selkä",
    Shoulders: "Olkapäät",
    Arms: "Kädet",
    Legs: "Jalat",
    Core: "Keskivartalo",
  },
} satisfies Messages<typeof en>;
