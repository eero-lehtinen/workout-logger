export function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-4">
      <h2 className="px-4 pb-1 text-lg font-semibold lg:px-0">{props.title}</h2>
      <div className="mx-2 flex flex-col rounded-2xl bg-raised py-1 lg:mx-0">
        {props.children}
      </div>
    </section>
  );
}

export function Row(props: {
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{props.label}</p>
        {props.hint && <p className="text-sm text-ink-muted">{props.hint}</p>}
      </div>
      {props.children}
    </div>
  );
}
