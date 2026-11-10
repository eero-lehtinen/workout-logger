import { Link, type LinkProps } from "@tanstack/react-router";
import { clsx } from "clsx";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/** The title row of a screen, with an optional way back and actions. */
export function PageHeader(props: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: LinkProps & { label: string };
  actions?: ReactNode;
  className?: string;
}) {
  const { back } = props;
  return (
    <header
      className={clsx(
        "sticky top-0 z-10 flex min-h-14 items-center gap-1 bg-chalk/92 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:static lg:bg-transparent lg:px-0 lg:pt-6 lg:backdrop-blur-none",
        props.className,
      )}
    >
      {back && (
        <Link
          {...back}
          aria-label={back.label}
          title={back.label}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface"
        >
          <ChevronLeft size={22} />
        </Link>
      )}
      <div className={clsx("min-w-0 flex-1", !back && "pl-2 lg:pl-0")}>
        <h1 className="truncate text-xl leading-tight font-semibold lg:text-2xl">
          {props.title}
        </h1>
        {props.subtitle && (
          <p className="truncate text-sm text-ink-muted">{props.subtitle}</p>
        )}
      </div>
      {props.actions && (
        <div className="flex shrink-0 items-center gap-1">{props.actions}</div>
      )}
    </header>
  );
}

/** A short line inviting the next action, for empty lists. */
export function Empty(props: { children: ReactNode }) {
  return (
    <p className="px-4 py-10 text-center text-[0.9375rem] text-ink-muted">
      {props.children}
    </p>
  );
}
