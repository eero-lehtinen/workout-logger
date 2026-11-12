import { Slider as BaseSlider } from "@base-ui/react/slider";
import { useState } from "react";

/**
 * Pick a number from a range. `onCommit` runs when a drag ends or on each key
 * press, not on every step of a drag.
 */
export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onCommit: (value: number) => void;
}) {
  // Shown while dragging and until the committed value comes back as a prop.
  const [value, setValue] = useState(props.value);
  const [prop, setProp] = useState(props.value);
  if (props.value !== prop) {
    setProp(props.value);
    setValue(props.value);
  }
  return (
    <BaseSlider.Root
      value={value}
      min={props.min}
      max={props.max}
      step={props.step}
      thumbAlignment="edge"
      onValueChange={setValue}
      onValueCommitted={props.onCommit}
      className="flex w-full items-center gap-3"
    >
      <BaseSlider.Control className="flex h-10 flex-1 touch-none items-center select-none">
        <BaseSlider.Track className="h-1.5 w-full rounded-full bg-rule">
          <BaseSlider.Indicator className="rounded-full bg-ink" />
          <BaseSlider.Thumb
            getAriaLabel={() => props.label}
            getAriaValueText={(_, current) => props.format(current)}
            className="size-6 rounded-full bg-chalk shadow-sm ring-1 ring-rule has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink"
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
      <span aria-hidden className="w-12 shrink-0 text-right tabular-nums">
        {props.format(value)}
      </span>
    </BaseSlider.Root>
  );
}
