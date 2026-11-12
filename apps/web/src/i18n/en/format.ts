/** Text inside formatted values (`lib/format.ts`). */
export const format = {
  reps_one: "{{count}} rep",
  reps_other: "{{count}} reps",
  distanceTime: "{{distance}} km in {{duration}}",
  justNow: "just now",
  bytes_one: "{{count}} B",
  bytes_other: "{{count}} B",
  exerciseTypes: {
    weight_reps: "Weight and reps",
    bodyweight_reps: "Bodyweight reps, optional added weight",
    reps: "Reps only",
    time: "Time",
    distance_time: "Distance and time",
  },
} as const;
