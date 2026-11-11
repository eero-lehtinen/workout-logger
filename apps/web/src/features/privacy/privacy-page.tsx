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
          <p>
            The app works fully without signing in. Your workouts then stay on
            this device and nothing is sent to the server. Keep your own backups
            with Settings → Export snapshot.
          </p>
        </Part>
        <Part title="With an account">
          <p>
            Signing in with Google creates an account here the first time. The
            server keeps your name, email address, and profile picture from
            Google, and the workout data your devices sync.
          </p>
          <p>
            One person, the owner, runs the server for a few people they know.
            Your data is stored unencrypted on the owner's server and in their
            backup storage, and the owner can technically read it. There is no
            end-to-end encryption.
          </p>
          <p>
            The server runs on a rented virtual server. Cloudflare carries the
            traffic to it and stores its backups. Google handles sign-in. Your
            data isn't sold or shared with anyone else.
          </p>
        </Part>
        <Part title="Your data">
          <p>
            <Link to="/settings" className="underline">
              Settings
            </Link>{" "}
            → Export snapshot saves all your data to a file at any time. A
            synced device holds all of your account's data.
          </p>
          <p>
            Settings → Delete account deletes your account and everything the
            server holds for it, right away. Your devices keep their own data.
            Backups made before the deletion still hold it until they expire:
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
