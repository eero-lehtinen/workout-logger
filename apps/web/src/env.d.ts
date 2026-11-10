interface ImportMetaEnv {
  /** Full commit SHA of this build; empty when it couldn't be determined. */
  readonly BUILD_COMMIT: string;
  /** When this build was made, ISO 8601 UTC. */
  readonly BUILD_TIME: string;
}
