import 'server-only';

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireEnv } from '@/lib/env';
import { IMMUTABLE_CACHE_CONTROL } from './keys';

let client: S3Client | undefined;

function getClient(): S3Client {
  client ??= new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: requireEnv('S3_ENDPOINT'),
    // Only the end-to-end tests set this (a local stand-in has no bucket sub-domains).
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    },
  });
  return client;
}

function bucket(): string {
  return requireEnv('S3_BUCKET');
}

export interface UploadTarget {
  url: string;
  /** Headers the browser must send with the PUT — they are part of the signature. */
  headers: Record<string, string>;
}

/**
 * Presigned PUT so the admin browser uploads straight to R2 (ADR 3).
 * The immutable Cache-Control is stored on the object, so the CDN serves it as-is.
 */
export async function createUploadUrl(input: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<UploadTarget> {
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: input.key,
    ContentType: input.contentType,
    CacheControl: IMMUTABLE_CACHE_CONTROL,
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn: input.expiresIn ?? 3600 });
  return {
    url,
    headers: { 'Content-Type': input.contentType, 'Cache-Control': IMMUTABLE_CACHE_CONTROL },
  };
}

/** Size and type of an uploaded object, or `null` if it does not exist. */
export async function headObject(
  key: string,
): Promise<{ size: number; contentType: string | undefined } | null> {
  try {
    const result = await getClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: result.ContentLength ?? 0, contentType: result.ContentType };
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
