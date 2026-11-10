import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { clsx } from "clsx";
import { Dumbbell, House, ListOrdered, Settings } from "lucide-react";
import { Suspense } from "react";
import { RestBar } from "../features/session/rest-bar.tsx";
import { useRunningSession } from "../features/session/running.ts";
import { ToastLayer } from "./toasts.tsx";
import { UpdatePrompt } from "./update-prompt.tsx";

const NAV = [
  { to: "/", label: "Today", icon: House, exact: true },
  { to: "/routines", label: "Routines", icon: ListOrdered, exact: false },
  { to: "/exercises", label: "Exercises", icon: Dumbbell, exact: false },
  { to: "/settings", label: "Settings", icon: Settings, exact: false },
] as const;

/**
 * Phones: one pane with bottom navigation, hidden while logging so the entry
 * panel owns the thumb zone. Wide screens: a sidebar.
 */
export function AppShell() {
  const matchRoute = useMatchRoute();
  const logging = Boolean(
    matchRoute({ to: "/sessions/$sessionId/$sessionExerciseId" }),
  );
  return (
    <div className="lg:flex lg:min-h-dvh">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <main
          className={clsx(
            "mx-auto w-full max-w-6xl lg:px-8 lg:pb-10",
            logging ? "pb-0" : "pb-[calc(4.5rem+env(safe-area-inset-bottom))]",
          )}
        >
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {!logging && <BottomNav />}
      {!logging && <RestBar />}
      <ToastLayer />
      <UpdatePrompt />
    </div>
  );
}

function Sidebar() {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-rule px-3 py-6 lg:flex"
    >
      <p className="px-3 pb-5 text-lg font-bold [font-stretch:80%]">
        Workout Logger
      </p>
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.exact }}
          className="flex h-10 items-center gap-3 rounded-lg px-3 font-medium text-ink-muted hover:bg-surface data-[status=active]:bg-surface data-[status=active]:text-ink"
        >
          <item.icon size={19} />
          {item.label}
          {item.to === "/" && <RunningDot />}
        </Link>
      ))}
    </nav>
  );
}

function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-rule bg-chalk/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {NAV.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.exact }}
          className="relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-ink-muted data-[status=active]:text-ink"
        >
          <item.icon size={22} />
          {item.label}
          {item.to === "/" && (
            <span className="absolute top-2.5 left-[calc(50%+0.6rem)]">
              <RunningDot />
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
  if (!running) return null;
  return (
    <span
      role="img"
      aria-label="Session running"
      className="ml-auto inline-block size-2 rounded-full bg-increase lg:ml-auto"
    />
  );
}
