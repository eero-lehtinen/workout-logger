import { AwsClient } from "aws4fetch";
import { XMLParser } from "fast-xml-parser";

export interface R2Config {
  /** `https://<account id>.r2.cloudflarestorage.com` */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface StoredObject {
  key: string;
  size: number;
}

/** Where backup files go. An interface so tests can keep them in memory. */
export interface BackupStore {
  put(key: string, body: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  list(): Promise<StoredObject[]>;
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

    async get(key) {
      const res = await client.fetch(`${base}/${key}`);
      if (!res.ok) {
        throw new Error(
          `R2 download of ${key} failed: ${res.status} ${await res.text()}`,
        );
      }
      return new Uint8Array(await res.arrayBuffer());
    },

    async list() {
      const objects: StoredObject[] = [];
      let token: string | undefined;
      do {
        const url = new URL(base);
        url.searchParams.set("list-type", "2");
        if (token) url.searchParams.set("continuation-token", token);
        const res = await client.fetch(url.toString());
        if (!res.ok) {
          throw new Error(
            `R2 listing failed: ${res.status} ${await res.text()}`,
          );
        }
        const page = parseListPage(await res.text());
        objects.push(...page.objects);
        token = page.nextToken;
      } while (token);
      return objects;
    },
  };
}

const listParser = new XMLParser({
  parseTagValue: false,
  isArray: (name) => name === "Contents",
});

/** One page of an S3 `ListObjectsV2` response. */
export function parseListPage(xml: string): {
  objects: StoredObject[];
  nextToken: string | undefined;
} {
  const result = listParser.parse(xml)?.ListBucketResult;
  if (!result) throw new Error("R2 listing: not a ListBucketResult");
  const contents: { Key: string; Size: string }[] = result.Contents ?? [];
  return {
    objects: contents.map((c) => ({ key: c.Key, size: Number(c.Size) })),
    nextToken:
      result.IsTruncated === "true" ? result.NextContinuationToken : undefined,
  };
}
