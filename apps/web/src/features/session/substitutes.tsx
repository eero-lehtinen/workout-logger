import { ArrowLeftRight } from "lucide-react";

/**
 * The slot's default exercise that a session exercise is done instead of,
 * marked with the Substitute action's icon. Inline, so it flows and truncates
 * with the text around it; the parent sets size and colour.
 */
export function Substitutes(props: { name: string }) {
  const space = props.name.indexOf(" ");
  const first = space < 0 ? props.name : props.name.slice(0, space);
  const rest = space < 0 ? "" : props.name.slice(space);
  return (
    <>
      {/* Wrapping text never leaves the icon alone at a line's end. */}
      <span className="whitespace-nowrap">
        <ArrowLeftRight
          aria-hidden
          className="mr-1 inline size-[1em] align-[-0.125em] opacity-75"
        />
        <span className="sr-only">Instead of </span>
        {first}
      </span>
      {rest}
    </>
  );
}
