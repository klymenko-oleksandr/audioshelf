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
  description: z.string().max(5000).optional().nullable(),
  coverObjectKey: z.string().optional().nullable(),
  chapters: z.array(chapterInputSchema).min(1, "At least one chapter is required"),
});

export const updateBookSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  author: z.string().min(1, "Author is required").max(255),
  description: z.string().max(5000).optional().nullable(),
  coverObjectKey: z.string().optional().nullable(),
  removeCover: z.boolean().optional(), // Flag to explicitly remove cover
  chapters: z.array(
    z.object({
      id: z.string().optional(), // Existing chapter ID (if updating)
      title: z.string().min(1, "Chapter title is required").max(255),
      order: z.number().int().min(1, "Order must be at least 1"),
      objectKey: z.string().min(1, "Audio object key is required"),
      mimeType: z.string().min(1, "MIME type is required"),
      duration: z.number().min(0, "Duration must be non-negative"),
    })
  ).min(1, "At least one chapter is required"),
  deletedChapterIds: z.array(z.string()).optional(), // Chapters to delete
});

export const uploadUrlSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  contentType: z.string().min(1),
  type: z.enum(["audio", "cover"]).optional().default("audio"),
}).refine(
  (data) => {
    if (data.type === "audio") {
      return data.contentType.startsWith("audio/");
    }
    if (data.type === "cover") {
      return data.contentType.startsWith("image/");
    }
    return true;
  },
  { message: "Invalid content type for the specified upload type" }
);

export type ChapterInput = z.infer<typeof chapterInputSchema>;
export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
