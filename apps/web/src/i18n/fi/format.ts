import type { format as en } from "../en/format.ts";
import type { Messages } from "../messages.ts";

export const format = {
  reps_one: "{{count}} toisto",
  reps_other: "{{count}} toistoa",
  distanceTime: "{{distance}} km ajassa {{duration}}",
  justNow: "juuri nyt",
  bytes_one: "{{count}} t",
  bytes_other: "{{count}} t",
  exerciseTypes: {
    weight_reps: "Paino ja toistot",
    bodyweight_reps: "Kehonpainotoistot, lisäpaino valinnainen",
    reps: "Vain toistot",
    time: "Aika",
    distance_time: "Matka ja aika",
  },
} satisfies Messages<typeof en>;
