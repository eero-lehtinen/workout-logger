import {
  COMMANDS,
  type CommandArgs,
  type CommandContext,
  type CommandDef,
  type CommandName,
  type CommandResult,
} from "./commands/index.ts";
import {
  QUERIES,
  type QueryArgs,
  type QueryName,
  type QueryResult,
} from "./queries/index.ts";
import type { Store } from "./store/store.ts";
import type { WriteResult } from "./store/write.ts";

export function runQuery<N extends QueryName>(
  store: Store,
  name: N,
  args: QueryArgs<N>,
): Promise<QueryResult<N>> {
  const query = QUERIES[name] as unknown as {
    run: (db: Store["db"], args: QueryArgs<N>) => Promise<QueryResult<N>>;
  };
  return query.run(store.db, args);
}

/** Runs a command as one undoable write transaction. */
export function runCommand<N extends CommandName>(
  store: Store,
  name: N,
  args: CommandArgs<N>,
  ctx: CommandContext = {
    now: store.now(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
): Promise<WriteResult<CommandResult<N>>> {
  const command = COMMANDS[name] as unknown as CommandDef<
    CommandArgs<N>,
    CommandResult<N>
  >;
  return store.writeUndoable((w) => command(w, args, ctx));
}
