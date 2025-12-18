import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.S3_REGION!,
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

const bucket = process.env.S3_BUCKET!;

export async function createUploadUrl(
  objectKey: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function createPlayUrl(
  objectKey: string,
  expiresIn = 300
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export function generateObjectKey(filename: string, prefix = "audio"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${prefix}/${timestamp}-${random}-${sanitized}`;
}

export async function deleteObject(objectKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });
  await s3Client.send(command);
}
