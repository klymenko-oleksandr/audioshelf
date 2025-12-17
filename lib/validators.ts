import { z } from "zod";

const chapterInputSchema = z.object({
  title: z.string().min(1, "Chapter title is required").max(255),
  order: z.number().int().min(1, "Order must be at least 1"),
  objectKey: z.string().min(1, "Audio object key is required"),
  mimeType: z.string().min(1, "MIME type is required"),
  duration: z.number().min(0, "Duration must be non-negative"),
});

export const createBookSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  author: z.string().min(1, "Author is required").max(255),
  coverUrl: z.string().url().optional().nullable(),
  chapters: z.array(chapterInputSchema).min(1, "At least one chapter is required"),
});

export const uploadUrlSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  contentType: z
    .string()
    .min(1)
    .refine(
      (type) => type.startsWith("audio/"),
      "Content type must be an audio format"
    ),
});

export type ChapterInput = z.infer<typeof chapterInputSchema>;
export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
