import { clsx } from "clsx";
import { SectionHeading } from "../../components/headings.tsx";

export function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-4 first:pt-0">
      <SectionHeading className="pb-1">{props.title}</SectionHeading>
      <div className="mx-2 flex flex-col rounded-2xl bg-raised py-1 lg:mx-0">
        {props.children}
      </div>
    </section>
  );
}

export function Row(props: {
  label: string;
  hint?: React.ReactNode;
  /** For a control too wide to sit beside the text on a phone: it goes below. */
  stacked?: boolean;
  /** A stacked control that spans the row on a phone, like a slider. */
  fill?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "flex gap-x-4 gap-y-2 px-4 py-3",
        props.stacked ? "flex-col lg:flex-row lg:items-center" : "items-center",
      )}
    >
      <div className="min-w-0 flex-1 wrap-anywhere">
        <p className="font-medium">{props.label}</p>
        {props.hint && <p className="text-sm text-ink-muted">{props.hint}</p>}
      </div>
      {props.stacked ? (
        <div
          className={
            props.fill
              ? "self-stretch lg:w-64 lg:self-auto"
              : "self-end lg:self-auto"
          }
        >
          {props.children}
        </div>
      ) : (
        props.children
      )}
    </div>
  );
}
