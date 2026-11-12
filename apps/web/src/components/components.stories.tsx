import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Marker } from "../features/session/marker.tsx";
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

export const StepperWeight: StoryObj = {
  render: () => <WeightStepper />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Increase weight" }),
    );
    await expect(canvas.getByLabelText("Weight in kg")).toHaveValue("102.5");
  },
};

export const StepperReplaceHint: StoryObj = {
  render: () => <WeightStepper />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Weight in kg");
    await userEvent.click(input);
    await expect(canvas.getByTestId("stepper-replace-hint")).toHaveTextContent(
      "100",
    );
    await userEvent.keyboard("8");
    await expect(input).toHaveValue("8");
    await expect(canvas.queryByTestId("stepper-replace-hint")).toBeNull();
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
