import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_E1RM_REP_CAP, estimateOneRepMax } from "@workout-logger/core";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const e1rm = estimateOneRepMax(100, 5);
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">Workout Logger</h1>
      <p className="mt-2 text-neutral-600">
        100 kg × 5 reps ≈ {e1rm?.toFixed(1)} kg e1RM (cap {DEFAULT_E1RM_REP_CAP}{" "}
        reps)
      </p>
    </main>
  );
}
