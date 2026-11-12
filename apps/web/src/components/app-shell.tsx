import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Dumbbell,
  House,
  ListOrdered,
  Settings,
} from "lucide-react";
import {
  Fragment,
  type MouseEvent,
  Suspense,
  useEffect,
  useLayoutEffect,
} from "react";
import { useTranslation } from "react-i18next";
import { KeepScreenAwake } from "../features/session/keep-screen-awake.tsx";
import { RestBar } from "../features/session/rest-bar.tsx";
import { useRunningSession } from "../features/session/running.ts";
import { AccountChoice } from "../features/settings/account-section.tsx";
import { AutoSnapshot } from "../features/settings/auto-snapshot.tsx";
import { i18n, useCurrentLanguage } from "../i18n/index.ts";
import { markAppReady } from "../lib/live-update.ts";
import { isPlainClick, type Tab, useSwitchTab } from "../lib/navigation.ts";
import { isNative } from "../lib/platform.ts";
import { useBackupWarning } from "../lib/server-status.ts";
import { AppUpdatePrompt } from "./app-update-prompt.tsx";
import { LiveUpdateSwitch } from "./live-update-switch.tsx";
import { ToastLayer } from "./toasts.tsx";
import { WebUpdate } from "./web-update.tsx";

const NAV = [
  { to: "/", label: "today", icon: House, exact: true },
  { to: "/history", label: "history", icon: CalendarDays, exact: false },
  { to: "/routines", label: "routines", icon: ListOrdered, exact: false },
  { to: "/exercises", label: "exercises", icon: Dumbbell, exact: false },
  { to: "/settings", label: "settings", icon: Settings, exact: false },
] as const;

/**
 * Phones: one pane with bottom navigation, hidden while logging so the entry
 * panel owns the thumb zone. Wide screens: a sidebar.
 *
 * The shell fills the viewport and never scrolls. Each screen scrolls only
 * its own body (see Screen), so scrollbars stay beside what scrolls.
 */
export function AppShell() {
  const matchRoute = useMatchRoute();
  const logging = Boolean(
    matchRoute({ to: "/sessions/$sessionId/$sessionExerciseId" }),
  );
  // The shell renders only over an open database, so this web build works.
  useEffect(markAppReady, []);
  const language = useCurrentLanguage();
  return (
    <div className="flex h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1">
          <Suspense fallback={null}>
            {/* Remounted on a language change: the compiler memoizes
                components that format dates or numbers without reading
                the language, so they wouldn't re-render by themselves. */}
            <Fragment key={language}>
              <Outlet />
              <RestoreScroll />
            </Fragment>
          </Suspense>
        </main>
        {!logging && <BottomNav />}
      </div>
      {!logging && <RestBar />}
      <ToastLayer />
      {/* The Android app has no service worker: its web build is replaced
          by live updates, and its shell by a new APK. */}
      {isNative ? <AppUpdatePrompt /> : <WebUpdate />}
      <Suspense fallback={null}>
        <KeepScreenAwake />
        {isNative && <AutoSnapshot />}
        {isNative && <LiveUpdateSwitch />}
        <AccountChoice />
      </Suspense>
    </div>
  );
}

const SCROLLER = "[data-scroll-restoration-id]";
let scrollBeforeLanguageChange = new Map<string, number>();

// The router restores scroll only on navigation, so the screen remounted
// for a new language would open at the top. The event fires before React
// renders the change, while the old screen is still in the DOM.
i18n.on("languageChanged", () => {
  scrollBeforeLanguageChange = new Map(
    Array.from(document.querySelectorAll<HTMLElement>(SCROLLER), (el) => [
      el.dataset.scrollRestorationId ?? "",
      el.scrollTop,
    ]),
  );
});

/** Mounted after the remounted screen, so its layout effect sees the new DOM. */
function RestoreScroll() {
  useLayoutEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>(SCROLLER)) {
      const top = scrollBeforeLanguageChange.get(
        el.dataset.scrollRestorationId ?? "",
      );
      if (top !== undefined) el.scrollTop = top;
    }
    scrollBeforeLanguageChange = new Map();
  }, []);
  return null;
}

function useTabClick() {
  const switchTab = useSwitchTab();
  return (tab: Tab) => (e: MouseEvent) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    void switchTab(tab);
  };
}

function Sidebar() {
  const onTab = useTabClick();
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("shell.mainNav")}
      className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-rule px-3 py-6 lg:flex"
    >
      <p className="px-3 pb-5 text-lg font-bold [font-stretch:80%]">
        {t("shell.appName")}
      </p>
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.exact }}
          onClick={onTab(item.to)}
          className="flex h-10 items-center gap-3 rounded-xl px-3 font-medium text-ink-muted hover:bg-surface data-[status=active]:bg-surface data-[status=active]:text-ink"
        >
          <item.icon size={19} />
          {t(`shell.nav.${item.label}`)}
          {item.to === "/" && <RunningDot />}
          {item.to === "/settings" && <WarningDot />}
        </Link>
      ))}
    </nav>
  );
}

function BottomNav() {
  const onTab = useTabClick();
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("shell.mainNav")}
      data-bottom-chrome
      className="grid shrink-0 grid-cols-5 border-t border-rule bg-chalk pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.exact }}
          onClick={onTab(item.to)}
          className="relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-ink-muted data-[status=active]:text-ink"
        >
          <item.icon size={22} />
          {t(`shell.nav.${item.label}`)}
          {item.to === "/" && (
            <span className="absolute top-2.5 left-[calc(50%+0.6rem)]">
              <RunningDot />
            </span>
          )}
          {item.to === "/settings" && (
            <span className="absolute top-2.5 left-[calc(50%+0.6rem)]">
              <WarningDot />
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Marks that a session is running. */
function RunningDot() {
  return (
    <Suspense fallback={null}>
      <RunningDotInner />
    </Suspense>
  );
}

function RunningDotInner() {
  const running = useRunningSession();
  const { t } = useTranslation();
  if (!running) return null;
  return (
    <span
      role="img"
      aria-label={t("shell.sessionRunning")}
      className="ml-auto inline-block size-2 rounded-full bg-increase lg:ml-auto"
    />
  );
}

/** Marks that data isn't reaching the server, or a server backup is stale. */
function WarningDot() {
  return (
    <Suspense fallback={null}>
      <WarningDotInner />
    </Suspense>
  );
}

function WarningDotInner() {
  const warning = useBackupWarning();
  if (!warning) return null;
  return (
    <span
      role="img"
      aria-label={warning}
      title={warning}
      className="ml-auto inline-block size-2 rounded-full bg-danger lg:ml-auto"
    />
  );
}
