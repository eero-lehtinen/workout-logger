import { Switch as BaseSwitch } from "@base-ui/react/switch";

/** An on/off setting that applies immediately. */
export function Switch(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <BaseSwitch.Root
      aria-label={props.label}
      checked={props.checked}
      onCheckedChange={props.onChange}
      className="relative flex h-7 w-12 shrink-0 rounded-full bg-rule p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-raised data-checked:bg-ink"
    >
      <BaseSwitch.Thumb className="size-6 rounded-full bg-chalk shadow-sm transition-transform data-checked:translate-x-5" />
    </BaseSwitch.Root>
  );
}
