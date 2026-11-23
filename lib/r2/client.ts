import 'server-only';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
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
    // The SDK's default adds a CRC32 of an empty body to presigned URLs; storage then checks it
    // against the real bytes and refuses the upload. Only add checksums when an operation needs one.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
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

const PART_URL_SECONDS = 4 * 3600;
const MAX_PARTS = 10_000;

/** Starts a multipart upload. The immutable Cache-Control is stored on the finished object. */
export async function createMultipartUpload(input: {
  key: string;
  contentType: string;
}): Promise<{ uploadId: string }> {
  const result = await getClient().send(
    new CreateMultipartUploadCommand({
      Bucket: bucket(),
      Key: input.key,
      ContentType: input.contentType,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    }),
  );
  if (!result.UploadId) throw new Error('Storage did not return an upload id.');
  return { uploadId: result.UploadId };
}

/**
 * One presigned address per part, for the browser to PUT each part to. They are valid for hours
 * because a 500 MB file on a slow line takes a while, and they send no extra headers.
 */
export async function createPartUploadUrls(input: {
  key: string;
  uploadId: string;
  partCount: number;
}): Promise<string[]> {
  if (!Number.isInteger(input.partCount) || input.partCount < 1 || input.partCount > MAX_PARTS) {
    throw new Error(`Invalid number of parts: ${input.partCount}`);
  }
  return Promise.all(
    Array.from({ length: input.partCount }, (_, index) =>
      getSignedUrl(
        getClient(),
        new UploadPartCommand({
          Bucket: bucket(),
          Key: input.key,
          UploadId: input.uploadId,
          PartNumber: index + 1,
        }),
        { expiresIn: PART_URL_SECONDS },
      ),
    ),
  );
}

/** Joins the uploaded parts into the object. `parts` must be in part order. */
export async function completeMultipartUpload(input: {
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
}): Promise<void> {
  await getClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: input.key,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: input.parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    }),
  );
}

/** Throws the uploaded parts away. An upload that is already gone counts as aborted. */
export async function abortMultipartUpload(input: {
  key: string;
  uploadId: string;
}): Promise<void> {
  try {
    await getClient().send(
      new AbortMultipartUploadCommand({
        Bucket: bucket(),
        Key: input.key,
        UploadId: input.uploadId,
      }),
    );
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return;
    throw error;
  }
}
