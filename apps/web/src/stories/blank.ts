/**
 * Watches the shell's `main` for a frame with nothing visible in it: React
 * hides a screen that suspends during a navigation, and the shell's Suspense
 * fallback is empty. Call the returned function to read the result and stop.
 */
export function watchForBlank(canvasElement: HTMLElement): () => boolean {
  const main = canvasElement.ownerDocument.querySelector("main");
  if (!main) throw new Error("No main element");
  let blanked = false;
  const check = () => {
    if (![...main.children].some((c) => c.checkVisibility())) blanked = true;
  };
  const observer = new MutationObserver(check);
  observer.observe(main, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });
  return () => {
    observer.disconnect();
    return blanked;
  };
}
