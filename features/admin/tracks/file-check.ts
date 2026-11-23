import type { AudioExtension } from '@/lib/r2/keys';

const MB = 1024 * 1024;

/**
 * The largest file the admin can add. Up to 100 MB it goes in one request; above that it is
 * sent in parts (`multipart.ts`).
 */
export const MAX_UPLOAD_BYTES = 500 * MB;

const MIME_BY_EXT: Record<AudioExtension, { mimeType: string; accepts: string[] }> = {
  mp3: { mimeType: 'audio/mpeg', accepts: ['audio/mpeg', 'audio/mp3'] },
  m4a: { mimeType: 'audio/mp4', accepts: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'] },
};

export type FileCheck =
  { ok: true; ext: AudioExtension; mimeType: string } | { ok: false; reason: string };

const ONLY = 'Only MP3 and M4A files can be uploaded.';

/**
 * Is this file one we take? MP3 and M4A only (ADR 3), judged by the extension, with the
 * browser-reported type as a cross-check (it is empty on some systems, so empty passes).
 */
export function checkAudioFile(file: { name: string; type: string; size: number }): FileCheck {
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (!ext) return { ok: false, reason: `${ONLY} This file has no extension.` };
  if (ext !== 'mp3' && ext !== 'm4a') return { ok: false, reason: `${ONLY} This one is .${ext}.` };

  const { mimeType, accepts } = MIME_BY_EXT[ext];
  const type = file.type.trim().toLowerCase();
  if (type && !accepts.includes(type)) {
    return { ok: false, reason: `This file says it is ${type}, which does not match .${ext}.` };
  }
  if (file.size <= 0) return { ok: false, reason: 'The file is empty.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `The file is larger than the ${MAX_UPLOAD_BYTES / MB} MB limit. Split it into parts.`,
    };
  }
  return { ok: true, ext, mimeType };
}
