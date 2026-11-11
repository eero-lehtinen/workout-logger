import { AwsClient } from "aws4fetch";

export interface R2Config {
  /** `https://<account id>.r2.cloudflarestorage.com` */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Where backup files go. An interface so tests can keep them in memory. */
export interface BackupStore {
  put(key: string, body: Uint8Array): Promise<void>;
}

export function r2Store(config: R2Config): BackupStore {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const base = `${config.endpoint.replace(/\/+$/, "")}/${config.bucket}`;
  return {
    async put(key, body) {
      const res = await client.fetch(`${base}/${key}`, {
        method: "PUT",
        // A copy on its own ArrayBuffer, which every BodyInit typing accepts.
        body: new Uint8Array(body),
        headers: { "Content-Type": "application/octet-stream" },
      });
      if (!res.ok) {
        throw new Error(
          `R2 upload of ${key} failed: ${res.status} ${await res.text()}`,
        );
      }
    },
  };
}
