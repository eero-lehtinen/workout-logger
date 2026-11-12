import { expect, within } from "storybook/test";

/**
 * The number in a `Stepper` is centered between its −/+ buttons, whatever
 * the label and unit beside it.
 */
export async function expectStepperCentered(input: HTMLElement) {
  let row = input.parentElement;
  while (row && !row.querySelector("button")) row = row.parentElement;
  if (!row) throw new Error("Not a stepper's input");
  const [lessButton, moreButton] = within(row).getAllByRole("button");
  if (!lessButton || !moreButton) throw new Error("Stepper without buttons");
  const less = lessButton.getBoundingClientRect();
  const more = moreButton.getBoundingClientRect();
  const style = getComputedStyle(input);
  const box = input.getBoundingClientRect();
  const textCenter =
    (box.left +
      Number.parseFloat(style.paddingLeft) +
      box.right -
      Number.parseFloat(style.paddingRight)) /
    2;
  await expect(style.textAlign).toBe("center");
  await expect(
    Math.abs(textCenter - (less.right + more.left) / 2),
  ).toBeLessThan(0.5);
}
