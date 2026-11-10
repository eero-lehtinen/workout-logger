import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type {
  CommandArgs,
  CommandName,
  CommandResult,
  QueryArgs,
  QueryName,
  QueryResult,
} from "@workout-logger/core";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { toasts } from "../components/toasts.tsx";
import type { DbClient } from "./client.ts";
import { DbOwner } from "./ownership.ts";

const DbContext = createContext<DbClient | null>(null);

export function useDb(): DbClient {
  const db = useContext(DbContext);
  if (!db) throw new Error("useDb outside DatabaseProvider");
  return db;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // Data changes only through commits, which invalidate by table tags.
      // The local database works offline, so never pause for the network.
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
        networkMode: "always",
      },
      mutations: { networkMode: "always" },
    },
  });
}

export type GateView = (props: {
  state: "starting" | "elsewhere" | "error";
  error?: unknown;
  takeOver: () => void;
  retry: () => void;
}) => ReactNode;

/**
 * Takes the database lock, opens the database in a worker, and renders the
 * app once it's ready. A new client per open, so a stolen-and-reclaimed
 * database never serves cached results from before.
 */
export function DatabaseProvider(props: {
  children: ReactNode;
  fallback: GateView;
}) {
  const [owner] = useState(() => new DbOwner());
  useEffect(() => owner.start(), [owner]);
  const state = useSyncExternalStore(owner.subscribe, owner.getState);
  const client = state.status === "ready" ? state.client : null;
  const [queryClient, setQueryClient] = useState<QueryClient | null>(null);

  useEffect(() => {
    if (!client) return;
    const qc = createQueryClient();
    let active = true;
    void client.onChange((names) => {
      if (!active) return;
      const changed = new Set<string>(names);
      void qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "db" && changed.has(q.queryKey[1] as string),
      });
    });
    setQueryClient(qc);
    return () => {
      active = false;
      qc.clear();
    };
  }, [client]);

  if (state.status !== "ready" || !queryClient) {
    const Fallback = props.fallback;
    return (
      <Fallback
        state={state.status === "ready" ? "starting" : state.status}
        error={state.status === "error" ? state.error : undefined}
        takeOver={() => owner.takeOver()}
        retry={() => owner.retry()}
      />
    );
  }
  return (
    <DbContext.Provider value={state.client}>
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    </DbContext.Provider>
  );
}

type ArgsParam<N extends QueryName> =
  unknown extends QueryArgs<N>
    ? []
    : undefined extends QueryArgs<N>
      ? []
      : [QueryArgs<N>];

/** A query against the local database. Suspends on the first load. */
export function useDbQuery<N extends QueryName>(
  name: N,
  ...args: ArgsParam<N>
): QueryResult<N> {
  const db = useDb();
  const params = args[0];
  return useSuspenseQuery({
    queryKey: ["db", name, params ?? null],
    queryFn: () => db.query(name, params as QueryArgs<N>),
  }).data as QueryResult<N>;
}

export interface CommandOptions {
  /** Shows an undo snackbar with this text after the command succeeds. */
  undoLabel?: string;
}

/**
 * Runs commands in the worker. Failures show a toast and resolve to
 * undefined, so callers only handle success.
 */
export function useCommand() {
  const db = useDb();
  return async <N extends CommandName>(
    name: N,
    args: CommandArgs<N>,
    options: CommandOptions = {},
  ): Promise<CommandResult<N> | undefined> => {
    try {
      const { result, undoTx } = await db.command(name, args);
      if (options.undoLabel && undoTx !== null) {
        toasts.add({
          title: options.undoLabel,
          actionProps: {
            children: "Undo",
            onClick: async () => {
              const undone = await db.undo(undoTx);
              if (!undone) {
                toasts.add({
                  title: "Can't undo: something else changed since",
                });
              }
            },
          },
        });
      }
      return result;
    } catch (error) {
      toasts.add({
        title: "That didn't save",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
      return undefined;
    }
  };
}
