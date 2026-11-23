import 'server-only';

import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  createPartUploadUrls,
  createUploadUrl,
  headObject,
} from '@/lib/r2/client';
import type { ImportStorage } from './data';

/** The import's bucket: Cloudflare R2, through the same helpers as the admin's uploads. */
export const r2ImportStorage: ImportStorage = {
  singleUpload: createUploadUrl,
  openMultipart: createMultipartUpload,
  partUrls: createPartUploadUrls,
  completeMultipart: completeMultipartUpload,
  abortMultipart: abortMultipartUpload,
  head: headObject,
};
