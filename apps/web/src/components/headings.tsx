import { clsx } from "clsx";
import type { ReactNode } from "react";

/**
 * The heading above a card or block. Inset to line up with the text inside
 * cards on phones, unless `inset` is false (e.g. inside a padded section).
 */
export function SectionHeading(props: {
  children: ReactNode;
  id?: string;
  level?: 2 | 3;
  inset?: boolean;
  className?: string;
}) {
  const Tag = props.level === 3 ? "h3" : "h2";
  return (
    <Tag
      id={props.id}
      className={clsx(
        "pb-2 text-lg font-semibold",
        props.inset !== false && "px-4 lg:px-0",
        props.className,
      )}
    >
      {props.children}
    </Tag>
  );
}

export const fieldLabelClass = "text-sm font-medium text-ink-muted";

/** A form field's label, or the title of a sub-block such as a chart. */
export function FieldLabel(props: {
  children: ReactNode;
  as?: "span" | "legend" | "h3" | "h4" | "p";
  id?: string;
  className?: string;
}) {
  const Tag = props.as ?? "span";
  return (
    <Tag id={props.id} className={clsx(fieldLabelClass, props.className)}>
      {props.children}
    </Tag>
  );
}
