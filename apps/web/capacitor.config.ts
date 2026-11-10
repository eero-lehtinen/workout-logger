/// <reference types="@capawesome/capacitor-live-update" />
import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Verifies the signature of a downloaded web build
 * (docs/deployment.md#live-updates). The private half signs the bundle in
 * CI. A change here reaches phones only with an APK, and until then they
 * refuse bundles signed with the new key.
 */
export const LIVE_UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAxtl4e4GK+J5SW/nsXzue
iVyiWeLiU/hFLRNLC6gAN19RuoGY+lDxorekzXkdIOCinfeifq4O4pbs1XsQf4St
wO7yXe13wM77yOKPY70d0SQ2NTFGXYd4kkx131tQN/pQ0jBwz0Nsqdc8/WwiIaGX
zTU40tICSmusO89w9hvItrlIBZ0NFsdpFWVA1kbOhMXqDJwh4/qK46+UK0w4j3E8
XvgXnjXx/7O20fhVA/OWRMkMtbRzSbroAQfb+IhiMsSl/zSIhKkqjLjXOvDSNjj9
WJjEmE9UHWEu8CW3hYf2FhK5/N1sOwU7tLs4LEB6R/4meyvtCRQvZRklG7gi/OlS
S/bqjZw34emad2bEO6cTw/e85/5xslyNKJRHcd5uDGP1Q5tZ9qyYpdCV30JLP8Zj
3Kk7PNsjmhrgobbnNjpud98aUjTdo+KXx1uKBa/9GIwyfmLuZ99JWNxQArS2jM7B
MKibwgO9JAQDhVpLnpJyWjEtTegGmYqljnAvMmiJw58RAgMBAAE=
-----END PUBLIC KEY-----`;

const config: CapacitorConfig = {
  // The app id, scheme, and hostname never change: each of them is part of
  // where the WebView keeps the database, so a change orphans it
  // (docs/architecture.md#storage-durability).
  appId: "fi.eerolehtinen.lift",
  appName: "Workouts",
  webDir: "dist",
  android: { path: "../android" },
  server: {
    androidScheme: "https",
    hostname: "localhost",
  },
  plugins: {
    LiveUpdate: {
      // Foreground time a new web build gets to open the database and
      // render before the shell goes back to the build in the APK. A
      // migration runs inside this window.
      readyTimeout: 20000,
      autoBlockRolledBackBundles: true,
      publicKey: LIVE_UPDATE_PUBLIC_KEY,
    },
  },
};

export default config;
