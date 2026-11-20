/**
 * Whether uploaded cover images are shown. For now every book shows the generated typographic
 * cover from the design (`BookCover`), whether or not it has an image, so the catalogue looks
 * the same everywhere (Sasha, 19 Nov). The images stay in the database and the bucket;
 * set `NEXT_PUBLIC_COVER_IMAGES=true` to show them again.
 */
export const COVER_IMAGES_ENABLED = process.env.NEXT_PUBLIC_COVER_IMAGES === 'true';
