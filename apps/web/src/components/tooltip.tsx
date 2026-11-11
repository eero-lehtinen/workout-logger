import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";

/**
 * Names an icon-only button or link on hover and focus. The child keeps its
 * own accessible name (`aria-label`); the tooltip is for sighted mouse users.
 */
export function IconTip(props: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger delay={300} render={props.children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-50">
          <Tooltip.Popup className="origin-[var(--transform-origin)] rounded-lg bg-ink px-2 py-1 text-sm text-chalk shadow-md transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {props.label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
