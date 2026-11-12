import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SectionHeading } from "../../components/headings.tsx";
import { PageHeader, Screen } from "../../components/page.tsx";

// The content of docs/accounts.md#privacy. Google's consent screen links
// here, so it must stay true to what the server does.

function Part(props: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 px-4 pt-5 lg:px-0">
      <SectionHeading inset={false} className="pb-0">
        {props.title}
      </SectionHeading>
      {props.children}
    </section>
  );
}

const RETENTION = [
  ["Continuous replica", "3 days"],
  ["Daily copies", "7 days"],
  ["Monthly copies", "3 months"],
  ["Copies made before a server update", "14 days"],
  ["The owner's own backup", "per its retention policy"],
];

export function PrivacyPage() {
  return (
    <Screen
      header={
        <PageHeader
          title="Privacy"
          back={{ to: "/settings", label: "Settings" }}
        />
      }
      scrollId="privacy"
      width="narrow"
    >
      <div className="flex flex-col pb-6 text-[0.9375rem] leading-relaxed">
        <Part title="Without an account">
          <p>Your data stays on this device. Nothing is sent to the server.</p>
        </Part>
        <Part title="With an account">
          <p>
            The server stores your name, email address, and profile picture from
            Google, and your synced workout data. It is not encrypted.
          </p>
          <p>
            Google handles sign-in. Cloudflare carries traffic to the server and
            stores its backups. Your data isn't sold or shared with anyone else.
          </p>
        </Part>
        <Part title="Your data">
          <p>
            <Link to="/settings" className="underline">
              Settings
            </Link>{" "}
            → Export snapshot saves all your data to a file.
          </p>
          <p>
            Settings → Delete account deletes everything the server holds for
            your account. Backups made before that keep it until they expire:
          </p>
          <ul className="list-disc pl-5 text-ink-muted">
            {RETENTION.map(([what, how]) => (
              <li key={what}>
                {what}: {how}
              </li>
            ))}
          </ul>
        </Part>
      </div>
    </Screen>
  );
}
