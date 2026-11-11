/**
 * Lists are raised cards, like settings sections, with lines between rows
 * (`dividers` in styles.css). A row's highlight is a flat fill that the card
 * clips to its corners, so the lines never cut through it.
 */
export const listClass =
  "dividers mx-2 flex flex-col overflow-clip rounded-2xl bg-raised empty:hidden lg:mx-0";

export const rowClass = "px-4 hover:bg-surface active:bg-rule/60";
