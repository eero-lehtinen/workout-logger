import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Marker } from "../features/session/marker.tsx";
import { expectStepperCentered } from "../stories/stepper.ts";
import { DbGate } from "./db-gate.tsx";
import { Stepper } from "./stepper.tsx";

export default {
  title: "Components",
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

function WeightStepper() {
  const [value, setValue] = useState<number | null>(100);
  return (
    <Stepper
      label="Weight"
      unit="kg"
      value={value}
      onChange={setValue}
      step={(v, d) => v + d * 2.5}
    />
  );
}

/** A tap shows the value it replaces; typing replaces it. */
export const StepperWeight: StoryObj = {
  render: () => <WeightStepper />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Increase weight" }),
    );
    const input = canvas.getByRole("textbox", { name: "Weight in kg" });
    await expect(input).toHaveValue("102.5");
    await expectStepperCentered(input);

    await userEvent.click(input);
    await expect(canvas.getByTestId("stepper-replace-hint")).toHaveTextContent(
      "102.5",
    );
    await userEvent.keyboard("8");
    await expect(input).toHaveValue("8");
    await expect(canvas.queryByTestId("stepper-replace-hint")).toBeNull();
  },
};

/**
 * On a 360 px phone a long label leaves no room to center the number, so the
 * number moves toward the unit rather than being cut off.
 */
export const StepperLongLabel: StoryObj = {
  render: () => (
    <div className="w-[328px]">
      <Stepper
        label="Lisäpaino"
        unit="kg"
        value={122.5}
        onChange={noop}
        step={(v, d) => v + d}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Lisäpaino in kg") as HTMLInputElement;
    await expect(input.scrollWidth).toBeLessThanOrEqual(input.clientWidth);
    const label = canvas.getByText("Lisäpaino");
    await expect(label.getBoundingClientRect().right).toBeLessThanOrEqual(
      input.getBoundingClientRect().left,
    );
  },
};

/** A label on one side only still leaves the number centered. */
export const StepperSizes: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-2">
      {(["lg", "md"] as const).map((size) => (
        <Stepper
          key={size}
          label={`Reps ${size}`}
          value={8}
          onChange={noop}
          step={(v, d) => v + d}
          size={size}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectStepperCentered(canvas.getByLabelText("Reps lg"));
    await expectStepperCentered(canvas.getByLabelText("Reps md"));
  },
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const StepperHold: StoryObj = {
  render: () => <WeightStepper />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const more = canvas.getByRole("button", { name: "Increase weight" });
    const weight = () =>
      Number((canvas.getByLabelText("Weight in kg") as HTMLInputElement).value);

    const user = userEvent.setup();
    await user.pointer({ keys: "[MouseLeft>]", target: more });
    await wait(1000);
    await user.pointer({ keys: "[/MouseLeft]", target: more });
    const held = weight();
    await expect(held).toBeGreaterThanOrEqual(107.5);

    await wait(300);
    await expect(weight()).toBe(held);

    more.focus();
    await user.keyboard("{Enter}");
    await expect(weight()).toBe(held + 2.5);
  },
};

export const Markers: StoryObj = {
  render: () => (
    <ul className="flex flex-col gap-2">
      <li className="flex items-center gap-2">
        <Marker marker="pr" type="weight_reps" unit="kg" /> Personal record
      </li>
      <li className="flex items-center gap-2">
        <Marker marker="set_record" type="weight_reps" unit="kg" /> Set record
      </li>
      <li className="flex items-center gap-2">
        <Marker marker="weight_increase" type="weight_reps" unit="kg" /> Weight
        increase
      </li>
    </ul>
  ),
};

const noop = () => {};

export const GateElsewhere: StoryObj = {
  render: () => <DbGate state="elsewhere" takeOver={noop} retry={noop} />,
};

export const GateBlocked: StoryObj = {
  render: () => <DbGate state="blocked" takeOver={noop} retry={noop} />,
};

export const GateError: StoryObj = {
  render: () => (
    <DbGate
      state="error"
      error={new Error("NoModificationAllowedError: the file is locked")}
      takeOver={noop}
      retry={noop}
    />
  ),
};

export const GateSchemaTooNew: StoryObj = {
  render: () => {
    const error = new Error("database schema version 3 is newer");
    error.name = "SchemaTooNewError";
    return <DbGate state="error" error={error} takeOver={noop} retry={noop} />;
  },
};
