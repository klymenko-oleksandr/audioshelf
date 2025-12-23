"use client";

import Image from "next/image";
import { Music } from "lucide-react";

interface ResponsiveBookCoverProps {
  coverUrl: string | null;
  coverThumbnailUrl?: string | null;
  coverMediumUrl?: string | null;
  coverLargeUrl?: string | null;
  title: string;
  className?: string;
  priority?: boolean;
}

export function ResponsiveBookCover({
  coverUrl,
  coverThumbnailUrl,
  coverMediumUrl,
  coverLargeUrl,
  title,
  className = "",
  priority = false,
}: ResponsiveBookCoverProps) {
  if (!coverUrl && !coverMediumUrl && !coverThumbnailUrl) {
    return (
      <div className={`bg-muted flex items-center justify-center ${className}`}>
        <Music className="w-12 h-12 text-muted-foreground" />
      </div>
    );
  }

  const imageSrc = coverMediumUrl || coverUrl || coverThumbnailUrl || "";

  return (
    <div className={`relative ${className}`}>
      <Image
        src={imageSrc}
        alt={title}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="object-cover"
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        quality={75}
        unoptimized={true}
      />
    </div>
  );
}
