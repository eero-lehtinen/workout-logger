import { Link, type LinkProps, useRouter } from "@tanstack/react-router";
import { clsx } from "clsx";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { isPlainClick, useGoesBack } from "../lib/navigation.ts";

/** Where a screen's back arrow leads, and its accessible name. */
export type BackTarget = LinkProps & { label: string };

const WIDTHS = {
  narrow: "max-w-2xl",
  medium: "max-w-3xl",
  wide: "max-w-6xl",
  /** Fills its pane, e.g. the session list next to the logging pane. */
  pane: "",
} as const;

/**
 * A screen: a fixed header, a body that alone scrolls, and an optional
 * fixed footer. Header, body, and footer span the full width with their
 * content centered, so the scrollbar runs at the edge and only beside the
 * body.
 */
export function Screen(props: {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Unique per screen: the router restores this body's scroll position. */
  scrollId: string;
  width?: keyof typeof WIDTHS;
  /** `bottom` pushes a short body to the bottom on phones, in thumb reach. */
  align?: "top" | "bottom";
}) {
  const width = clsx(
    "mx-auto w-full",
    props.width === "pane" ? "lg:px-6" : "lg:px-8",
    WIDTHS[props.width ?? "wide"],
  );
  return (
    <div className="flex h-full min-h-0 flex-col [timeline-scope:--screen]">
      <div className="z-10 shrink-0 bg-chalk scroll-edge">
        <div className={width}>{props.header}</div>
      </div>
      <div
        data-scroll-restoration-id={props.scrollId}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scroll-timeline:--screen_y]"
      >
        <div
          className={clsx(
            width,
            "pb-8 lg:pb-10",
            props.align === "bottom" &&
              "max-lg:flex max-lg:min-h-full max-lg:flex-col max-lg:justify-end",
          )}
        >
          {props.children}
        </div>
      </div>
      {props.footer && (
        <div
          data-bottom-chrome
          className="shrink-0 border-t border-rule bg-chalk pb-[env(safe-area-inset-bottom)]"
        >
          <div className={width}>{props.footer}</div>
        </div>
      )}
    </div>
  );
}

/**
 * The title row of a screen, with an optional way back and actions.
 * `children` (e.g. search and filters) go below it, in the fixed header.
 */
export function PageHeader(props: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: BackTarget;
  actions?: ReactNode;
  /** Lets a long title take two lines instead of truncating. */
  wrap?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { back } = props;
  return (
    <header
      className={clsx("pt-[env(safe-area-inset-top)] lg:pt-6", props.className)}
    >
      <div className="flex min-h-14 items-center gap-1 px-2 lg:px-0">
        {back && <BackLink back={back} />}
        <div className={clsx("min-w-0 flex-1", !back && "pl-2 lg:pl-0")}>
          <h1
            className={clsx(
              "text-xl leading-tight font-semibold lg:text-2xl",
              props.wrap ? "line-clamp-2 py-1" : "truncate",
            )}
          >
            {props.title}
          </h1>
          {props.subtitle && (
            <p className="truncate text-sm text-ink-muted">{props.subtitle}</p>
          )}
        </div>
        {props.actions && (
          <div className="flex shrink-0 items-center gap-1">
            {props.actions}
          </div>
        )}
      </div>
      {props.children && (
        // As much space above as below, measured from the subtitle's text.
        <div className="px-4 pt-1.5 pb-3 lg:px-0 lg:pt-2.25">
          {props.children}
        </div>
      )}
    </header>
  );
}

/** Behaves like `useGoBack`; a modified click still opens a new tab. */
function BackLink(props: { back: BackTarget }) {
  const { label, ...target } = props.back;
  const goesBack = useGoesBack(target);
  const router = useRouter();
  return (
    <Link
      {...target}
      replace
      aria-label={label}
      title={label}
      onClick={(e) => {
        if (goesBack && isPlainClick(e)) {
          e.preventDefault();
          router.history.back();
        }
      }}
      className="flex size-10 shrink-0 items-center justify-center rounded-xl hover:bg-surface"
    >
      <ChevronLeft size={22} />
    </Link>
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
