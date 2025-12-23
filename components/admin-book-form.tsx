"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Check, Loader2, X, Plus, ImageIcon, ArrowLeft } from "lucide-react";
import { generateUUID } from "@/lib/uuid";

type Step = "form" | "uploading" | "saving" | "done";

interface ChapterData {
  id?: string; // Existing chapter ID
  tempId: string; // Temporary ID for new chapters
  file?: File; // Only for new chapters
  objectKey?: string; // For existing chapters
  mimeType?: string;
  title: string;
  duration: number;
}

interface BookData {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  coverObjectKey: string | null;
  chapters: Array<{
    id: string;
    title: string;
    order: number;
    objectKey: string;
    mimeType: string;
    duration: number;
  }>;
}

interface AdminBookFormProps {
  mode: "create" | "edit";
  bookId?: string;
  initialData?: BookData;
  onSuccess?: () => void;
}

export function AdminBookForm({ mode, bookId, initialData, onSuccess }: AdminBookFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [author, setAuthor] = useState(initialData?.author ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(initialData?.coverUrl ?? null);
  const [existingCoverKey, setExistingCoverKey] = useState<string | null>(initialData?.coverObjectKey ?? null);
  const [coverVariants, setCoverVariants] = useState<{
    thumbnail?: string;
    medium?: string;
    large?: string;
  } | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [chapters, setChapters] = useState<ChapterData[]>(() => {
    if (initialData?.chapters) {
      return initialData.chapters.map((ch) => ({
        id: ch.id,
        tempId: ch.id,
        objectKey: ch.objectKey,
        mimeType: ch.mimeType,
        title: ch.title,
        duration: ch.duration,
      }));
    }
    return [];
  });
  const [deletedChapterIds, setDeletedChapterIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingChapter, setUploadingChapter] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setStep("form");
    setTitle("");
    setAuthor("");
    setDescription("");
    setCoverFile(null);
    setCoverPreview(null);
    setExistingCoverKey(null);
    setRemoveCover(false);
    setChapters([]);
    setDeletedChapterIds([]);
    setError(null);
    setUploadProgress(0);
    setUploadingChapter(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (coverInputRef.current) {
      coverInputRef.current.value = "";
    }
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.addEventListener("loadedmetadata", () => {
        resolve(audio.duration);
      });
      audio.addEventListener("error", () => {
        resolve(0);
      });
      audio.src = URL.createObjectURL(file);
    });
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newChapters: ChapterData[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const duration = await getAudioDuration(file);
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      newChapters.push({
        tempId: generateUUID(),
        file,
        title: fileNameWithoutExt,
        duration,
      });
    }
    setChapters((prev) => [...prev, ...newChapters]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const updateChapterTitle = (tempId: string, newTitle: string) => {
    setChapters((prev) =>
      prev.map((ch) => (ch.tempId === tempId ? { ...ch, title: newTitle } : ch))
    );
  };

  const removeChapter = (tempId: string) => {
    const chapter = chapters.find((ch) => ch.tempId === tempId);
    if (chapter?.id) {
      setDeletedChapterIds((prev) => [...prev, chapter.id!]);
    }
    setChapters((prev) => prev.filter((ch) => ch.tempId !== tempId));
  };

  const moveChapter = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= chapters.length) return;
    setChapters((prev) => {
      const newChapters = [...prev];
      const [moved] = newChapters.splice(fromIndex, 1);
      newChapters.splice(toIndex, 0, moved);
      return newChapters;
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCoverSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setRemoveCover(false);
    if (coverInputRef.current) {
      coverInputRef.current.value = "";
    }
  };

  const handleRemoveCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
    setRemoveCover(true);
    if (coverInputRef.current) {
      coverInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (chapters.length === 0) {
      setError("Please add at least one chapter");
      return;
    }

    if (!title.trim() || !author.trim()) {
      setError("Title and author are required");
      return;
    }

    try {
      setStep("uploading");

      // Upload and optimize cover image if new one selected
      let coverImageVariants: {
        thumbnail?: string;
        medium?: string;
        large?: string;
      } | null = null;
      
      if (coverFile) {
        setUploadingChapter(0);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append("file", coverFile);

        const optimizeRes = await fetch("/api/admin/optimize-image", {
          method: "POST",
          body: formData,
        });

        if (!optimizeRes.ok) {
          const data = await optimizeRes.json();
          throw new Error(data.error || "Failed to optimize cover image");
        }

        const { variants } = await optimizeRes.json();
        coverImageVariants = {
          thumbnail: variants.thumbnail?.objectKey,
          medium: variants.medium?.objectKey,
          large: variants.large?.objectKey,
        };
        
        setUploadProgress(100);
      }

      // Upload new chapter files
      const processedChapters: Array<{
        id?: string;
        title: string;
        order: number;
        objectKey: string;
        mimeType: string;
        duration: number;
      }> = [];

      let newChapterIndex = 0;
      const newChapters = chapters.filter((ch) => ch.file);

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];

        if (chapter.file) {
          // New chapter - needs upload
          newChapterIndex++;
          setUploadingChapter(newChapterIndex);
          setUploadProgress(0);

          const uploadUrlRes = await fetch("/api/admin/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: chapter.file.name,
              contentType: chapter.file.type,
              type: "audio",
            }),
          });

          if (!uploadUrlRes.ok) {
            const data = await uploadUrlRes.json();
            throw new Error(data.error || `Failed to get upload URL for chapter`);
          }

          const { uploadUrl, objectKey } = await uploadUrlRes.json();

          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            body: chapter.file,
            headers: {
              "Content-Type": chapter.file.type,
            },
          });

          if (!uploadRes.ok) {
            throw new Error(`Failed to upload chapter`);
          }

          setUploadProgress(100);

          processedChapters.push({
            title: chapter.title,
            order: i + 1,
            objectKey,
            mimeType: chapter.file.type,
            duration: chapter.duration,
          });
        } else {
          // Existing chapter
          processedChapters.push({
            id: chapter.id,
            title: chapter.title,
            order: i + 1,
            objectKey: chapter.objectKey!,
            mimeType: chapter.mimeType!,
            duration: chapter.duration,
          });
        }
      }

      // Save to database
      setStep("saving");

      if (mode === "create") {
        const createRes = await fetch("/api/admin/books", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            author: author.trim(),
            description: description.trim() || null,
            coverThumbnailKey: coverImageVariants?.thumbnail || null,
            coverMediumKey: coverImageVariants?.medium || null,
            coverLargeKey: coverImageVariants?.large || null,
            chapters: processedChapters,
          }),
        });

        if (!createRes.ok) {
          const data = await createRes.json();
          throw new Error(data.error || "Failed to create book");
        }
      } else {
        const updateRes = await fetch(`/api/admin/books/${bookId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            author: author.trim(),
            description: description.trim() || null,
            coverThumbnailKey: removeCover ? null : (coverImageVariants?.thumbnail || undefined),
            coverMediumKey: removeCover ? null : (coverImageVariants?.medium || undefined),
            coverLargeKey: removeCover ? null : (coverImageVariants?.large || undefined),
            removeCover,
            chapters: processedChapters,
            deletedChapterIds,
          }),
        });

        if (!updateRes.ok) {
          const data = await updateRes.json();
          throw new Error(data.error || "Failed to update book");
        }
      }

      setStep("done");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStep("form");
    }
  };

  if (step === "done") {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold">
                {mode === "create" ? "Audiobook Added!" : "Audiobook Updated!"}
              </h3>
              <p className="text-sm text-muted-foreground">
                &quot;{title}&quot; has been successfully {mode === "create" ? "uploaded" : "updated"}.
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              {mode === "create" && (
                <Button onClick={resetForm}>Add Another</Button>
              )}
              <Button variant="outline" onClick={() => router.push("/admin")}>
                Back to Admin
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const newChaptersCount = chapters.filter((ch) => ch.file).length;

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          {mode === "edit" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/admin")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <CardTitle>
            {mode === "create" ? "Add New Audiobook" : "Edit Audiobook"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter book title"
              disabled={step !== "form"}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Author *</Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Enter author name"
              disabled={step !== "form"}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
              placeholder="Enter book description..."
              disabled={step !== "form"}
              rows={3}
              maxLength={5000}
            />
            <p className={`text-xs ${description.length > 4500 ? 'text-orange-500' : 'text-muted-foreground'}`}>
              {description.length}/5000 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label>Cover Image (optional)</Label>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleCoverSelected(e.target.files)}
              disabled={step !== "form"}
              className="hidden"
            />
            {coverPreview && !removeCover ? (
              <div className="relative w-32 h-32">
                <img
                  src={coverPreview}
                  alt="Cover preview"
                  className="w-full h-full object-cover rounded border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={handleRemoveCover}
                  disabled={step !== "form"}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => coverInputRef.current?.click()}
                disabled={step !== "form"}
                className="w-32 h-32 flex flex-col items-center justify-center gap-2"
              >
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Add cover</span>
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Recommended: 1280×720px or larger, 16:9 ratio. JPG, PNG, or WebP.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Chapters *</Label>
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                onChange={(e) => handleFilesSelected(e.target.files)}
                disabled={step !== "form"}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={step !== "form"}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Select one or more audio files. You can reorder them below.
            </p>
          </div>

          {chapters.length > 0 && (
            <div className="space-y-2">
              <Label>Chapter Order</Label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {chapters.map((chapter, index) => (
                  <div
                    key={chapter.tempId}
                    className={`flex items-center gap-2 p-2 rounded border ${
                      chapter.file ? "bg-blue-50 dark:bg-blue-950" : "bg-muted"
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => moveChapter(index, index - 1)}
                        disabled={index === 0 || step !== "form"}
                      >
                        ▲
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => moveChapter(index, index + 1)}
                        disabled={index === chapters.length - 1 || step !== "form"}
                      >
                        ▼
                      </Button>
                    </div>
                    <span className="text-sm text-muted-foreground w-6">
                      {index + 1}.
                    </span>
                    <Input
                      value={chapter.title}
                      onChange={(e) => updateChapterTitle(chapter.tempId, e.target.value)}
                      disabled={step !== "form"}
                      className="flex-1 h-8"
                      placeholder="Chapter title"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDuration(chapter.duration)}
                    </span>
                    {chapter.file && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">New</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeChapter(chapter.tempId)}
                      disabled={step !== "form"}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Total duration: {formatDuration(chapters.reduce((sum, ch) => sum + ch.duration, 0))}
                {newChaptersCount > 0 && ` • ${newChaptersCount} new chapter${newChaptersCount !== 1 ? "s" : ""} to upload`}
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600 dark:bg-red-950 dark:border-red-800">
              {error}
            </div>
          )}

          {step === "uploading" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploadingChapter === 0
                  ? "Uploading cover image..."
                  : `Uploading new chapter ${uploadingChapter} of ${newChaptersCount}...`}
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{
                    width:
                      uploadingChapter === 0
                        ? `${uploadProgress}%`
                        : `${((uploadingChapter - 1) / newChaptersCount) * 100 + uploadProgress / newChaptersCount}%`,
                  }}
                />
              </div>
            </div>
          )}

          {step === "saving" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving book metadata...
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={step !== "form" || chapters.length === 0}
          >
            <Upload className="w-4 h-4 mr-2" />
            {mode === "create"
              ? `Upload Audiobook (${chapters.length} chapter${chapters.length !== 1 ? "s" : ""})`
              : `Save Changes`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
