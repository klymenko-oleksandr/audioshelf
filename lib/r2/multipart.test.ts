// @vitest-environment node
import { S3Client } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  createPartUploadUrls,
  createUploadUrl,
} from './client';

const KEY = 'books/my-book/audio/01-part-ab12cd34.mp3';

beforeEach(() => {
  vi.stubEnv('S3_ENDPOINT', 'https://account.r2.test');
  vi.stubEnv('S3_ACCESS_KEY_ID', 'id');
  vi.stubEnv('S3_SECRET_ACCESS_KEY', 'secret');
  vi.stubEnv('S3_BUCKET', 'bucket');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('createMultipartUpload', () => {
  it('starts the upload with the type and the immutable cache header, and returns the upload id', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({ UploadId: 'up-1' } as never);
    expect(await createMultipartUpload({ key: KEY, contentType: 'audio/mpeg' })).toEqual({
      uploadId: 'up-1',
    });
    const command = send.mock.calls[0]![0] as unknown as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Bucket: 'bucket',
      Key: KEY,
      ContentType: 'audio/mpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    });
  });

  it('fails when storage gives no upload id', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    await expect(createMultipartUpload({ key: KEY, contentType: 'audio/mpeg' })).rejects.toThrow(
      /upload id/i,
    );
  });
});

describe('createPartUploadUrls', () => {
  it('signs one address per part number for this key and upload, valid for hours, with no headers to send', async () => {
    const urls = await createPartUploadUrls({ key: KEY, uploadId: 'up-1', partCount: 3 });
    expect(urls).toHaveLength(3);
    urls.forEach((url, index) => {
      const parsed = new URL(url);
      expect(parsed.pathname).toContain(KEY);
      expect(parsed.searchParams.get('partNumber')).toBe(String(index + 1));
      expect(parsed.searchParams.get('uploadId')).toBe('up-1');
      expect(parsed.searchParams.get('X-Amz-Signature')).toBeTruthy();
      expect(Number(parsed.searchParams.get('X-Amz-Expires'))).toBeGreaterThanOrEqual(3 * 3600);
    });
  });

  it('carries no checksum parameters: they are computed for an empty body, and storage would reject the real bytes', async () => {
    const [url] = await createPartUploadUrls({ key: KEY, uploadId: 'up-1', partCount: 1 });
    const names = [...new URL(url!).searchParams.keys()].map((n) => n.toLowerCase());
    expect(names.filter((n) => n.includes('checksum'))).toEqual([]);
  });

  it('refuses a part count that is not a whole number from 1 to 10,000', async () => {
    for (const partCount of [0, -1, 1.5, 10_001]) {
      await expect(
        createPartUploadUrls({ key: KEY, uploadId: 'up-1', partCount }),
      ).rejects.toThrow();
    }
  });
});

describe('completeMultipartUpload', () => {
  it('sends the parts in order with their ETags', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    await completeMultipartUpload({
      key: KEY,
      uploadId: 'up-1',
      parts: [
        { partNumber: 1, etag: '"a"' },
        { partNumber: 2, etag: '"b"' },
      ],
    });
    const command = send.mock.calls[0]![0] as unknown as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Bucket: 'bucket',
      Key: KEY,
      UploadId: 'up-1',
      MultipartUpload: {
        Parts: [
          { PartNumber: 1, ETag: '"a"' },
          { PartNumber: 2, ETag: '"b"' },
        ],
      },
    });
  });
});

describe('abortMultipartUpload', () => {
  it('aborts that upload', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    await abortMultipartUpload({ key: KEY, uploadId: 'up-1' });
    const command = send.mock.calls[0]![0] as unknown as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({ Bucket: 'bucket', Key: KEY, UploadId: 'up-1' });
  });

  it('treats an upload that no longer exists as already aborted', async () => {
    const { S3ServiceException } = await import('@aws-sdk/client-s3');
    const gone = new S3ServiceException({
      name: 'NoSuchUpload',
      $fault: 'client',
      $metadata: { httpStatusCode: 404 },
      message: 'gone',
    });
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(gone);
    await expect(abortMultipartUpload({ key: KEY, uploadId: 'up-1' })).resolves.toBeUndefined();
  });

  it('lets other errors through, so a failed abort is not silently ignored', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('network down'));
    await expect(abortMultipartUpload({ key: KEY, uploadId: 'up-1' })).rejects.toThrow(
      'network down',
    );
  });
});

describe('createUploadUrl (single request)', () => {
  it('carries no checksum parameters either', async () => {
    const { url } = await createUploadUrl({ key: KEY, contentType: 'audio/mpeg' });
    const names = [...new URL(url).searchParams.keys()].map((n) => n.toLowerCase());
    expect(names.filter((n) => n.includes('checksum'))).toEqual([]);
  });
});
