import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";

import { serverEnv } from "./env";

// Reads uploaded files from the S3-compatible storage that Payload's storage
// plugin writes to (payload.config.ts), for the public file route. Payload
// itself serves files to staff only.

const CONNECT_TIMEOUT_MS = 5_000;
/** Time without data from storage before the read is abandoned. */
const IDLE_TIMEOUT_MS = 15_000;

let client: S3Client | undefined;

function storageClient(): S3Client {
  if (!client) {
    const { storage } = serverEnv();
    client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
      // As in payload.config.ts: other services expect the bucket in the path.
      forcePathStyle: Boolean(storage.endpoint),
      requestHandler: {
        connectionTimeout: CONNECT_TIMEOUT_MS,
        requestTimeout: IDLE_TIMEOUT_MS,
      },
    });
  }
  return client;
}

export type StoredFile = {
  body: ReadableStream<Uint8Array>;
  contentLength: number | null;
  etag: string | null;
};

/** A stored file's content, or null when storage has no such object. */
export async function readStoredFile(
  key: string,
  signal?: AbortSignal,
): Promise<StoredFile | null> {
  try {
    const object = await storageClient().send(
      new GetObjectCommand({ Bucket: serverEnv().storage.bucket, Key: key }),
      { abortSignal: signal },
    );
    if (!object.Body) return null;
    return {
      body: object.Body.transformToWebStream(),
      contentLength: object.ContentLength ?? null,
      etag: object.ETag ?? null,
    };
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    throw error;
  }
}
