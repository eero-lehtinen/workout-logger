import { ArrowLeftRight } from "lucide-react";
import { Trans } from "react-i18next";

/**
 * The slot's default exercise that a session exercise is done instead of,
 * marked with the Substitute action's icon. Inline, so it flows and truncates
 * with the text around it; the parent sets size and colour.
 *
 * The name is split at its first space: `<nowrap>` keeps the icon and the
 * first word together, so wrapping never leaves the icon alone at a line's
 * end. `<sr>` text is read by screen readers only.
 */
export function Substitutes(props: { name: string }) {
  const space = props.name.indexOf(" ");
  const first = space < 0 ? props.name : props.name.slice(0, space);
  const rest = space < 0 ? "" : props.name.slice(space);
  return (
    <Trans
      i18nKey="session.substitutes.insteadOf"
      values={{ first, rest }}
      components={{
        nowrap: <span className="whitespace-nowrap" />,
        icon: (
          <ArrowLeftRight
            aria-hidden
            className="mr-1 inline size-[1em] align-[-0.125em] opacity-75"
          />
        ),
        sr: <span className="sr-only" />,
      }}
    />
  );
}
