import type { common as en } from "../en/common.ts";
import type { Messages } from "../messages.ts";

export const common = {
  add: "Lisää",
  cancel: "Peruuta",
  close: "Sulje",
  delete: "Poista",
  edit: "Muokkaa",
  save: "Tallenna",
  tryAgain: "Yritä uudelleen",
  undo: "Kumoa",
  reload: "Lataa uudelleen",
  update: "Päivitä",
  enterNumber: "{{field}}: anna luku",
} satisfies Messages<typeof en>;
