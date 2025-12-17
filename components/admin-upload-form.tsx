"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Check, Loader2, GripVertical, X, Plus } from "lucide-react";

type Step = "form" | "uploading" | "saving" | "done";

interface ChapterFile {
  id: string;
  file: File;
  title: string;
  duration: number;
}

export function AdminUploadForm() {
  const [step, setStep] = useState<Step>("form");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [chapters, setChapters] = useState<ChapterFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingChapter, setUploadingChapter] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setStep("form");
    setTitle("");
    setAuthor("");
    setCoverUrl("");
    setChapters([]);
    setError(null);
    setUploadProgress(0);
    setUploadingChapter(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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

    const newChapters: ChapterFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const duration = await getAudioDuration(file);
      const chapterNumber = chapters.length + newChapters.length + 1;
      newChapters.push({
        id: crypto.randomUUID(),
        file,
        title: `Chapter ${chapterNumber}`,
        duration,
      });
    }
    setChapters((prev) => [...prev, ...newChapters]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const updateChapterTitle = (id: string, newTitle: string) => {
    setChapters((prev) =>
      prev.map((ch) => (ch.id === id ? { ...ch, title: newTitle } : ch))
    );
  };

  const removeChapter = (id: string) => {
    setChapters((prev) => prev.filter((ch) => ch.id !== id));
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
      
      // Upload all chapters and collect their object keys
      const uploadedChapters: Array<{
        title: string;
        order: number;
        objectKey: string;
        mimeType: string;
        duration: number;
      }> = [];

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        setUploadingChapter(i + 1);
        setUploadProgress(0);

        // Get presigned upload URL
        const uploadUrlRes = await fetch("/api/admin/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: chapter.file.name,
            contentType: chapter.file.type,
          }),
        });

        if (!uploadUrlRes.ok) {
          const data = await uploadUrlRes.json();
          throw new Error(data.error || `Failed to get upload URL for chapter ${i + 1}`);
        }

        const { uploadUrl, objectKey } = await uploadUrlRes.json();

        // Upload file directly to S3
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: chapter.file,
          headers: {
            "Content-Type": chapter.file.type,
          },
        });

        if (!uploadRes.ok) {
          throw new Error(`Failed to upload chapter ${i + 1}`);
        }

        setUploadProgress(100);

        uploadedChapters.push({
          title: chapter.title,
          order: i + 1,
          objectKey,
          mimeType: chapter.file.type,
          duration: chapter.duration,
        });
      }

      // Create book record with all chapters
      setStep("saving");
      const createRes = await fetch("/api/admin/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim(),
          coverUrl: coverUrl.trim() || null,
          chapters: uploadedChapters,
        }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error || "Failed to create book");
      }

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStep("form");
    }
  };

  if (step === "done") {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold">Audiobook Added!</h3>
              <p className="text-sm text-muted-foreground">
                &quot;{title}&quot; has been successfully uploaded.
              </p>
            </div>
            <Button onClick={resetForm}>Add Another</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Add New Audiobook</CardTitle>
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
            <Label htmlFor="coverUrl">Cover Image URL (optional)</Label>
            <Input
              id="coverUrl"
              type="url"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://example.com/cover.jpg"
              disabled={step !== "form"}
            />
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
              <Label>Chapter Order (drag to reorder)</Label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {chapters.map((chapter, index) => (
                  <div
                    key={chapter.id}
                    className="flex items-center gap-2 p-2 bg-muted rounded border"
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
                      onChange={(e) => updateChapterTitle(chapter.id, e.target.value)}
                      disabled={step !== "form"}
                      className="flex-1 h-8"
                      placeholder="Chapter title"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDuration(chapter.duration)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeChapter(chapter.id)}
                      disabled={step !== "form"}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Total duration: {formatDuration(chapters.reduce((sum, ch) => sum + ch.duration, 0))}
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
                Uploading chapter {uploadingChapter} of {chapters.length}...
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${((uploadingChapter - 1) / chapters.length) * 100 + (uploadProgress / chapters.length)}%` }}
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
            Upload Audiobook ({chapters.length} chapter{chapters.length !== 1 ? "s" : ""})
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
