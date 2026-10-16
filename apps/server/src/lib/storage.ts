import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Env } from '../config/env.js';

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  quarantineBucket: string;
  mediaBucket: string;
}

export function storageConfigFromEnv(env: Env): StorageConfig | null {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null;
  return {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    quarantineBucket: env.S3_BUCKET_QUARANTINE,
    mediaBucket: env.S3_BUCKET_MEDIA,
  };
}

export interface ObjectStream {
  body: Readable;
  contentLength: number;
  contentRange?: string;
}

/** Thin wrapper over an S3-compatible store (SeaweedFS, AWS S3, R2, Garage…). */
export class Storage {
  readonly client: S3Client;

  constructor(readonly config: StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // Only compute/validate checksums when the operation requires it (broadest compatibility).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  /** Readiness: the media bucket answers (throws otherwise). */
  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.config.mediaBucket }));
  }

  /** Creates the buckets if missing (idempotent). */
  async ensureBuckets(): Promise<void> {
    for (const bucket of [this.config.quarantineBucket, this.config.mediaBucket]) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await this.client
          .send(new CreateBucketCommand({ Bucket: bucket }))
          .catch((err: unknown) => {
            const name = (err as { name?: string }).name;
            if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw err;
          });
      }
    }
  }

  async put(
    bucket: string,
    key: string,
    body: Readable | Buffer,
    contentType: string,
  ): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: { Bucket: bucket, Key: key, Body: body, ContentType: contentType },
      queueSize: 2,
      partSize: 8 * 1024 * 1024,
    });
    await upload.done();
  }

  async get(bucket: string, key: string, range?: string): Promise<ObjectStream> {
    const output: GetObjectCommandOutput = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, ...(range ? { Range: range } : {}) }),
    );
    if (!output.Body) throw new Error('Empty object body');
    return {
      body: output.Body as Readable,
      contentLength: output.ContentLength ?? 0,
      ...(output.ContentRange ? { contentRange: output.ContentRange } : {}),
    };
  }

  async download(bucket: string, key: string, filePath: string): Promise<void> {
    const { body } = await this.get(bucket, key);
    await pipeline(body, createWriteStream(filePath, { mode: 0o600 }));
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
