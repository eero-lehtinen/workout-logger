import { userEvent, within } from "storybook/test";

/** Opens the dropdown named `label` and picks `option`, like a user would. */
export async function choose(
  canvasElement: HTMLElement,
  label: string,
  option: string,
) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("combobox", { name: label }));
  // The options open in a portal, outside the story's canvas.
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(await body.findByRole("option", { name: option }));
}
