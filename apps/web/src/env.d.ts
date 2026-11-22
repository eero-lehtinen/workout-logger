interface ImportMetaEnv {
  /** Full commit SHA of this build; empty when it couldn't be determined. */
  readonly BUILD_COMMIT: string;
  /** When this build was made, ISO 8601 UTC. */
  readonly BUILD_TIME: string;
  /**
   * The controller's name and address in the privacy notice, from the
   * build's CONTACT_NAME and CONTACT_EMAIL; empty when the build was given
   * none.
   */
  readonly CONTACT_NAME: string;
  readonly CONTACT_EMAIL: string;
}
