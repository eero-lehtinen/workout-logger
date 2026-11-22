/**
 * Who answers for the personal data on the server this build is served from
 * (docs/privacy.md#controller). Both come from the build, so the source
 * names nobody: a build of someone else's server can't claim the owner of
 * this repository as its controller. A build given neither says so.
 */
export const CONTROLLER = {
  name: import.meta.env.CONTACT_NAME,
  email: import.meta.env.CONTACT_EMAIL,
} as const;

/** The day the notice's content last changed (docs/privacy.md#keeping-it-compliant). */
export const NOTICE_UPDATED = "2026-11-22";
