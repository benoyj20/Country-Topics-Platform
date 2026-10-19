import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { S3Location } from "./env.ts";

// The S3-compatible storage the backups read from and write to: the site's
// uploads bucket and the backup bucket, possibly on different services.

const CONNECT_TIMEOUT_MS = 5_000;
/** How long a request may sit idle; a large dump is still streaming. */
const IDLE_TIMEOUT_MS = 60_000;
/** The most keys one DeleteObjects request takes. */
const DELETE_BATCH = 1_000;

export type Storage = {
  bucket: string;
  /** Every key under `prefix`, with its size. */
  list(prefix: string): AsyncGenerator<{ key: string; size: number }>;
  readText(key: string): Promise<string>;
  writeText(key: string, text: string, contentType: string): Promise<void>;
  /** Uploads a local file. */
  writeFile(key: string, path: string, contentType: string): Promise<void>;
  /** Downloads an object to a local file. */
  readToFile(key: string, path: string): Promise<void>;
  /** An object's content, to copy into another storage. */
  open(key: string): Promise<{ body: Readable; size: number; type?: string }>;
  write(
    key: string,
    body: Readable,
    size: number,
    contentType?: string,
  ): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** Creates the bucket if it does not exist (for restoring into a new one). */
  ensureBucket(): Promise<void>;
  close(): void;
};

export function createStorage(location: S3Location): Storage {
  const client = new S3Client({
    endpoint: location.endpoint,
    region: location.region,
    credentials: {
      accessKeyId: location.accessKeyId,
      secretAccessKey: location.secretAccessKey,
    },
    // Non-AWS services (SeaweedFS locally, R2, MinIO) expect the bucket in
    // the path rather than the host name, as the site does.
    forcePathStyle: Boolean(location.endpoint),
    requestHandler: {
      connectionTimeout: CONNECT_TIMEOUT_MS,
      requestTimeout: IDLE_TIMEOUT_MS,
    },
  });
  const Bucket = location.bucket;

  async function open(key: string) {
    const result = await client.send(
      new GetObjectCommand({ Bucket, Key: key }),
    );
    if (!(result.Body instanceof Readable)) {
      throw new Error(`Storage returned no content for ${key}.`);
    }
    return {
      body: result.Body,
      size: result.ContentLength ?? 0,
      type: result.ContentType,
    };
  }

  return {
    bucket: Bucket,
    async *list(prefix) {
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const item of page.Contents ?? []) {
          if (item.Key) yield { key: item.Key, size: item.Size ?? 0 };
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    },
    async readText(key) {
      const { body } = await open(key);
      const chunks: Buffer[] = [];
      for await (const chunk of body) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString("utf8");
    },
    async writeText(key, text, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: text,
          ContentType: contentType,
        }),
      );
    },
    async writeFile(key, path, contentType) {
      const { size } = await stat(path);
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: createReadStream(path),
          ContentLength: size,
          ContentType: contentType,
        }),
      );
    },
    async readToFile(key, path) {
      const { body } = await open(key);
      await pipeline(body, createWriteStream(path));
    },
    open,
    async write(key, body, size, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentLength: size,
          ContentType: contentType,
        }),
      );
    },
    async remove(keys) {
      for (let start = 0; start < keys.length; start += DELETE_BATCH) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: {
              Objects: keys
                .slice(start, start + DELETE_BATCH)
                .map((Key) => ({ Key })),
            },
          }),
        );
      }
    },
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if (status !== 404) throw error;
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
    close: () => client.destroy(),
  };
}
