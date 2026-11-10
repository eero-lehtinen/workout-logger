import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "./button.tsx";

/** A new version waits until the user reloads; it never activates mid-session. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] right-3 left-3 z-40 mx-auto flex max-w-sm items-center gap-2 rounded-xl bg-ink py-2 pr-2 pl-4 text-chalk shadow-lg lg:right-6 lg:left-auto"
    >
      <p className="flex-1 text-sm">A new version is ready.</p>
      <Button
        size="sm"
        variant="ghost"
        className="text-chalk hover:bg-chalk/10"
        onClick={() => setNeedRefresh(false)}
      >
        Later
      </Button>
      <Button
        size="sm"
        className="bg-chalk text-ink hover:bg-chalk/90"
        onClick={() => updateServiceWorker(true)}
      >
        Reload
      </Button>
    </div>
  );
}
