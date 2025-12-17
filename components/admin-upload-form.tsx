"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Check, Loader2 } from "lucide-react";

type Step = "form" | "uploading" | "saving" | "done";

export function AdminUploadForm() {
  const [step, setStep] = useState<Step>("form");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setStep("form");
    setTitle("");
    setAuthor("");
    setCoverUrl("");
    setAudioFile(null);
    setError(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!audioFile) {
      setError("Please select an audio file");
      return;
    }

    if (!title.trim() || !author.trim()) {
      setError("Title and author are required");
      return;
    }

    try {
      // Step 1: Get presigned upload URL
      setStep("uploading");
      const uploadUrlRes = await fetch("/api/admin/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: audioFile.name,
          contentType: audioFile.type,
        }),
      });

      if (!uploadUrlRes.ok) {
        const data = await uploadUrlRes.json();
        throw new Error(data.error || "Failed to get upload URL");
      }

      const { uploadUrl, objectKey } = await uploadUrlRes.json();

      // Step 2: Upload file directly to S3
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: audioFile,
        headers: {
          "Content-Type": audioFile.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to storage");
      }

      setUploadProgress(100);

      // Step 3: Create book record
      setStep("saving");
      const createRes = await fetch("/api/admin/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim(),
          coverUrl: coverUrl.trim() || null,
          objectKey,
          mimeType: audioFile.type,
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
            <Label htmlFor="audio">Audio File *</Label>
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                id="audio"
                type="file"
                accept="audio/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                disabled={step !== "form"}
                className="flex-1"
              />
            </div>
            {audioFile && (
              <p className="text-xs text-muted-foreground">
                Selected: {audioFile.name} (
                {(audioFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
              {error}
            </div>
          )}

          {step === "uploading" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading audio file...
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
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
            disabled={step !== "form"}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Audiobook
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
