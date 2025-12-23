# Offline Functionality Implementation Plan

## Overview
This document outlines the complete implementation plan for adding offline functionality to the AudioShelf application, allowing users to download audiobooks and listen to them without an internet connection.

## Core Features
1. **Download audiobooks/chapters** for offline use
2. **Highlight books** that are available offline
3. **Dedicated offline library page** to view and manage downloaded content
4. **Offline playback** support in the audio player

---

## Technical Architecture

### Storage Strategy
- **IndexedDB**: Store book/chapter metadata, download status, and progress tracking
- **Cache API** (via Service Worker): Store actual audio files and cover images
- **Storage Quota Management**: Monitor and manage available storage space

### Key Technologies
- Next.js PWA capabilities
- Service Worker for offline support
- IndexedDB for structured data storage
- Cache API for file storage
- Background Sync API for progress updates

---

## Implementation Phases

### **Phase 1: Foundation** (Setup & Core Infrastructure)

#### 1.1 Install Dependencies
```bash
npm install next-pwa
npm install --save-dev @types/serviceworker
```

#### 1.2 Configure Next.js for PWA
**File**: `next.config.ts`
```typescript
import type { NextConfig } from "next";
import withPWA from 'next-pwa';

const nextConfig: NextConfig = {
  /* existing config */
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.amazonaws\.com\/.*\.(mp3|m4a|m4b|aac)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'audio-files',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    {
      urlPattern: /^https:\/\/.*\.amazonaws\.com\/.*\.(jpg|jpeg|png|webp)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
  ],
})(nextConfig);
```

#### 1.3 Create PWA Manifest
**File**: `public/manifest.json`
```json
{
  "name": "AudioShelf",
  "short_name": "AudioShelf",
  "description": "Your personal audiobook library",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

#### 1.4 Create IndexedDB Storage Layer
**File**: `lib/offline/storage.ts`
```typescript
export interface OfflineBook {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  totalDuration: number;
  downloadedAt: Date;
  totalSize: number;
  chapters: OfflineChapter[];
}

export interface OfflineChapter {
  chapterId: string;
  bookId: string;
  title: string;
  duration: number;
  cacheKey: string;
  audioUrl: string;
  size: number;
  downloadStatus: 'pending' | 'downloading' | 'completed' | 'failed';
  downloadProgress: number; // 0-100
  downloadedAt?: Date;
}

const DB_NAME = 'audioshelf-offline';
const DB_VERSION = 1;
const BOOKS_STORE = 'books';
const CHAPTERS_STORE = 'chapters';

class OfflineStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(BOOKS_STORE)) {
          db.createObjectStore(BOOKS_STORE, { keyPath: 'bookId' });
        }

        if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
          const chapterStore = db.createObjectStore(CHAPTERS_STORE, { keyPath: 'chapterId' });
          chapterStore.createIndex('bookId', 'bookId', { unique: false });
        }
      };
    });
  }

  async saveBook(book: OfflineBook): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([BOOKS_STORE], 'readwrite');
      const store = transaction.objectStore(BOOKS_STORE);
      const request = store.put(book);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getBook(bookId: string): Promise<OfflineBook | null> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([BOOKS_STORE], 'readonly');
      const store = transaction.objectStore(BOOKS_STORE);
      const request = store.get(bookId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllBooks(): Promise<OfflineBook[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([BOOKS_STORE], 'readonly');
      const store = transaction.objectStore(BOOKS_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBook(bookId: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([BOOKS_STORE, CHAPTERS_STORE], 'readwrite');
      
      // Delete book
      const bookStore = transaction.objectStore(BOOKS_STORE);
      bookStore.delete(bookId);

      // Delete all chapters
      const chapterStore = transaction.objectStore(CHAPTERS_STORE);
      const index = chapterStore.index('bookId');
      const request = index.openCursor(IDBKeyRange.only(bookId));
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async saveChapter(chapter: OfflineChapter): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE], 'readwrite');
      const store = transaction.objectStore(CHAPTERS_STORE);
      const request = store.put(chapter);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getChapter(chapterId: string): Promise<OfflineChapter | null> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE], 'readonly');
      const store = transaction.objectStore(CHAPTERS_STORE);
      const request = store.get(chapterId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getBookChapters(bookId: string): Promise<OfflineChapter[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CHAPTERS_STORE], 'readonly');
      const store = transaction.objectStore(CHAPTERS_STORE);
      const index = store.index('bookId');
      const request = index.getAll(bookId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async checkStorageQuota(): Promise<{ usage: number; quota: number; available: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      return {
        usage,
        quota,
        available: quota - usage,
      };
    }
    return { usage: 0, quota: 0, available: 0 };
  }
}

export const offlineStorage = new OfflineStorage();
```

#### 1.5 Create Network Status Hook
**File**: `lib/hooks/use-online-status.ts`
```typescript
import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

---

### **Phase 2: Download System**

#### 2.1 Create Download Manager
**File**: `lib/offline/download-manager.ts`
```typescript
import { offlineStorage, OfflineBook, OfflineChapter } from './storage';

interface DownloadQueueItem {
  bookId: string;
  chapterId: string;
  audioUrl: string;
  priority: number;
}

class DownloadManager {
  private queue: DownloadQueueItem[] = [];
  private activeDownloads = new Map<string, AbortController>();
  private maxConcurrent = 2;

  async downloadBook(bookId: string, chapters: { id: string; audioUrl: string; title: string; duration: number }[]): Promise<void> {
    // Add all chapters to queue
    for (const chapter of chapters) {
      this.queue.push({
        bookId,
        chapterId: chapter.id,
        audioUrl: chapter.audioUrl,
        priority: 1,
      });

      // Save chapter metadata
      await offlineStorage.saveChapter({
        chapterId: chapter.id,
        bookId,
        title: chapter.title,
        duration: chapter.duration,
        cacheKey: `audio-${chapter.id}`,
        audioUrl: chapter.audioUrl,
        size: 0,
        downloadStatus: 'pending',
        downloadProgress: 0,
      });
    }

    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.activeDownloads.size < this.maxConcurrent) {
      const item = this.queue.shift();
      if (!item) break;

      this.downloadChapter(item);
    }
  }

  private async downloadChapter(item: DownloadQueueItem): Promise<void> {
    const { bookId, chapterId, audioUrl } = item;
    const controller = new AbortController();
    this.activeDownloads.set(chapterId, controller);

    try {
      // Update status to downloading
      const chapter = await offlineStorage.getChapter(chapterId);
      if (chapter) {
        chapter.downloadStatus = 'downloading';
        await offlineStorage.saveChapter(chapter);
      }

      // Fetch the audio file
      const response = await fetch(audioUrl, { signal: controller.signal });
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const size = blob.size;

      // Cache the audio file
      const cache = await caches.open('audio-files');
      await cache.put(audioUrl, new Response(blob));

      // Update chapter status
      if (chapter) {
        chapter.downloadStatus = 'completed';
        chapter.downloadProgress = 100;
        chapter.size = size;
        chapter.downloadedAt = new Date();
        await offlineStorage.saveChapter(chapter);
      }

      this.activeDownloads.delete(chapterId);
      this.processQueue();
    } catch (error) {
      console.error(`Failed to download chapter ${chapterId}:`, error);
      
      const chapter = await offlineStorage.getChapter(chapterId);
      if (chapter) {
        chapter.downloadStatus = 'failed';
        await offlineStorage.saveChapter(chapter);
      }

      this.activeDownloads.delete(chapterId);
      this.processQueue();
    }
  }

  cancelDownload(chapterId: string): void {
    const controller = this.activeDownloads.get(chapterId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(chapterId);
    }
  }

  async deleteBook(bookId: string): Promise<void> {
    // Get all chapters
    const chapters = await offlineStorage.getBookChapters(bookId);
    
    // Delete from cache
    const cache = await caches.open('audio-files');
    for (const chapter of chapters) {
      await cache.delete(chapter.audioUrl);
    }

    // Delete from IndexedDB
    await offlineStorage.deleteBook(bookId);
  }
}

export const downloadManager = new DownloadManager();
```

#### 2.2 Create Download Hook
**File**: `lib/hooks/use-download.ts`
```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadManager } from '../offline/download-manager';
import { offlineStorage } from '../offline/storage';

export function useDownloadBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookId, chapters }: { 
      bookId: string; 
      chapters: { id: string; audioUrl: string; title: string; duration: number }[] 
    }) => {
      await downloadManager.downloadBook(bookId, chapters);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline-books'] });
    },
  });
}

export function useDeleteOfflineBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookId: string) => {
      await downloadManager.deleteBook(bookId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline-books'] });
    },
  });
}

export function useOfflineBooks() {
  return useQuery({
    queryKey: ['offline-books'],
    queryFn: async () => {
      return await offlineStorage.getAllBooks();
    },
  });
}

export function useIsBookOffline(bookId: string) {
  return useQuery({
    queryKey: ['offline-book', bookId],
    queryFn: async () => {
      const book = await offlineStorage.getBook(bookId);
      return book !== null;
    },
  });
}
```

#### 2.3 Create Download Button Component
**File**: `components/download-button.tsx`
```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Download, Loader2, Check, Trash2 } from "lucide-react";
import { useDownloadBook, useDeleteOfflineBook, useIsBookOffline } from "@/lib/hooks/use-download";
import { Book } from "@/lib/types";

interface DownloadButtonProps {
  book: Book;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function DownloadButton({ book, variant = "outline", size = "default" }: DownloadButtonProps) {
  const { data: isOffline, isLoading: checkingOffline } = useIsBookOffline(book.id);
  const downloadBook = useDownloadBook();
  const deleteBook = useDeleteOfflineBook();

  const handleDownload = async () => {
    if (isOffline) {
      // Delete offline book
      await deleteBook.mutateAsync(book.id);
    } else {
      // Download book
      const chapters = book.chapters.map(ch => ({
        id: ch.id,
        audioUrl: ch.objectKey, // You'll need to get the actual URL
        title: ch.title,
        duration: ch.duration,
      }));
      await downloadBook.mutateAsync({ bookId: book.id, chapters });
    }
  };

  if (checkingOffline) {
    return (
      <Button variant={variant} size={size} disabled>
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleDownload}
      disabled={downloadBook.isPending || deleteBook.isPending}
    >
      {downloadBook.isPending || deleteBook.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isOffline ? (
        <>
          <Check className="w-4 h-4 mr-2" />
          Downloaded
        </>
      ) : (
        <>
          <Download className="w-4 h-4 mr-2" />
          Download
        </>
      )}
    </Button>
  );
}
```

#### 2.4 Create Offline Badge Component
**File**: `components/offline-badge.tsx`
```typescript
"use client";

import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { useIsBookOffline } from "@/lib/hooks/use-download";

interface OfflineBadgeProps {
  bookId: string;
}

export function OfflineBadge({ bookId }: OfflineBadgeProps) {
  const { data: isOffline } = useIsBookOffline(bookId);

  if (!isOffline) return null;

  return (
    <Badge variant="secondary" className="gap-1">
      <Download className="w-3 h-3" />
      Offline
    </Badge>
  );
}
```

---

### **Phase 3: Offline Playback**

#### 3.1 Update Audio Player to Support Offline
**File**: `components/global-audio-player.tsx` (modifications)
```typescript
// Add this function to check for offline audio
const getAudioUrl = async (chapterId: string): Promise<string | null> => {
  // First check if we have it offline
  const offlineChapter = await offlineStorage.getChapter(chapterId);
  if (offlineChapter && offlineChapter.downloadStatus === 'completed') {
    // Try to get from cache
    const cache = await caches.open('audio-files');
    const cachedResponse = await cache.match(offlineChapter.audioUrl);
    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      return URL.createObjectURL(blob);
    }
  }
  
  // Fall back to online URL
  return null;
};

// Modify loadChapter function to check offline first
const loadChapter = useCallback(async (chapterId: string, seekPosition?: number) => {
  if (!book || playUrlMutation.isPending) return;

  try {
    // Check offline first
    const offlineUrl = await getAudioUrl(chapterId);
    
    if (offlineUrl) {
      // Use offline URL
      setAudioUrl(offlineUrl);
      // Load chapter metadata from offline storage
      const offlineChapter = await offlineStorage.getChapter(chapterId);
      if (offlineChapter) {
        setCurrentChapter({
          id: offlineChapter.chapterId,
          title: offlineChapter.title,
          order: 0, // You'll need to track this
          duration: offlineChapter.duration,
        });
      }
    } else {
      // Fall back to online
      const playData = await playUrlMutation.mutateAsync({
        bookId: book.id,
        chapterId,
      });
      
      setAudioUrl(playData.playUrl);
      setCurrentChapter(playData.chapter);
      setTotalChapters(playData.totalChapters);
    }
    
    if (seekPosition !== undefined && seekPosition > 0) {
      setInitialPosition(seekPosition);
      setCurrentTime(seekPosition);
    } else {
      setInitialPosition(null);
      setCurrentTime(0);
    }
  } catch (err) {
    // Error handling
  }
}, [book, playUrlMutation]);
```

---

### **Phase 4: Management UI**

#### 4.1 Create Offline Library Page
**File**: `app/offline/page.tsx`
```typescript
"use client";

import { useOfflineBooks } from "@/lib/hooks/use-download";
import { BookCard } from "@/components/book-card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, HardDrive } from "lucide-react";
import Link from "next/link";
import { offlineStorage } from "@/lib/offline/storage";
import { useEffect, useState } from "react";

export default function OfflinePage() {
  const { data: offlineBooks, isLoading } = useOfflineBooks();
  const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0, available: 0 });

  useEffect(() => {
    offlineStorage.checkStorageQuota().then(setStorageInfo);
  }, [offlineBooks]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-screen-xl mx-auto px-4 py-6">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Library
          </Link>
          <h1 className="text-3xl font-bold">Offline Library</h1>
          <p className="text-muted-foreground mt-2">
            Books available for offline listening
          </p>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-8">
        {/* Storage Info */}
        <div className="bg-muted rounded-lg p-4 mb-6 flex items-center gap-4">
          <HardDrive className="w-6 h-6 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">Storage Used</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(storageInfo.usage)} of {formatBytes(storageInfo.quota)} used
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{formatBytes(storageInfo.available)}</p>
            <p className="text-xs text-muted-foreground">available</p>
          </div>
        </div>

        {/* Books Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : offlineBooks && offlineBooks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {offlineBooks.map((book) => (
              <div key={book.bookId}>
                {/* You'll need to convert OfflineBook to Book type */}
                {/* <BookCard book={book} /> */}
                <div className="text-sm">{book.title}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No offline books yet</p>
            <Link href="/">
              <Button>Browse Library</Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
```

#### 4.2 Update Book Card Component
**File**: `components/book-card.tsx` (add offline badge)
```typescript
// Add import
import { OfflineBadge } from "./offline-badge";

// In the render, add badge to cover image section:
<div className="aspect-video relative bg-muted flex items-center justify-center">
  {/* Existing cover image code */}
  
  {/* Add offline badge */}
  <div className="absolute top-2 left-2">
    <OfflineBadge bookId={book.id} />
  </div>
  
  {/* Existing buttons */}
</div>
```

#### 4.3 Update Book Detail Page
**File**: `app/books/[id]/page.tsx` (add download button)
```typescript
// Add import
import { DownloadButton } from "@/components/download-button";

// Add download button next to Play button:
<div className="flex gap-2 mb-6">
  <Button onClick={handlePlayBook} size="lg">
    {/* Existing play button content */}
  </Button>
  <DownloadButton book={book} size="lg" />
</div>
```

---

### **Phase 5: Polish & Optimization**

#### 5.1 Add Service Worker Registration
**File**: `app/layout.tsx` (add to existing layout)
```typescript
// Add useEffect to register service worker
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('Service Worker registered:', registration);
      },
      (error) => {
        console.error('Service Worker registration failed:', error);
      }
    );
  }
}, []);
```

#### 5.2 Add Offline Indicator
**File**: `components/offline-indicator.tsx`
```typescript
"use client";

import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { WifiOff } from "lucide-react";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-black px-4 py-2 text-center text-sm font-medium z-50 flex items-center justify-center gap-2">
      <WifiOff className="w-4 h-4" />
      You are offline. Only downloaded content is available.
    </div>
  );
}
```

---

## Testing Checklist

### Download Functionality
- [ ] Can download a single book
- [ ] Can download multiple books simultaneously
- [ ] Download progress is tracked correctly
- [ ] Can cancel an in-progress download
- [ ] Failed downloads are handled gracefully
- [ ] Storage quota is checked before download

### Offline Playback
- [ ] Can play downloaded books while offline
- [ ] Audio player works with offline files
- [ ] Chapter navigation works offline
- [ ] Progress is saved locally when offline
- [ ] Progress syncs when back online

### UI/UX
- [ ] Offline badge appears on downloaded books
- [ ] Download button shows correct state
- [ ] Offline library page displays correctly
- [ ] Storage usage is accurate
- [ ] Can delete offline books
- [ ] Offline indicator appears when offline

### Edge Cases
- [ ] Handles running out of storage
- [ ] Handles network interruptions during download
- [ ] Handles app closing during download
- [ ] Handles corrupted cached files
- [ ] Handles service worker update

---

## Storage Considerations

### Typical File Sizes
- Average audiobook chapter: 20-50 MB
- Average book cover: 100-500 KB
- Full audiobook (10 hours): 500 MB - 1 GB

### Mobile Browser Limits
- **iOS Safari**: ~50 MB without prompt, up to 500 MB with prompt
- **Chrome Android**: ~6% of free disk space
- **Firefox Android**: ~10% of total disk space

### Best Practices
1. Request persistent storage for important data
2. Implement storage cleanup for old/unused downloads
3. Warn users before downloading large books
4. Provide clear storage usage information
5. Allow selective chapter downloads for large books

---

## Future Enhancements

### Priority 1
- [ ] Background download support
- [ ] Download queue management UI
- [ ] Selective chapter downloads
- [ ] Download over WiFi only option

### Priority 2
- [ ] Export/import offline library
- [ ] Download scheduling
- [ ] Auto-delete finished books
- [ ] Offline search

### Priority 3
- [ ] P2P sharing between devices
- [ ] Smart storage management
- [ ] Offline-first architecture
- [ ] Sync conflict resolution

---

## Troubleshooting

### Service Worker Not Registering
- Check HTTPS is enabled (required for SW)
- Verify `sw.js` is in public directory
- Check browser console for errors

### Downloads Failing
- Verify CORS headers on S3 bucket
- Check storage quota
- Verify audio URLs are accessible

### Offline Playback Not Working
- Check Cache API is populated
- Verify IndexedDB has chapter metadata
- Check audio URL blob creation

---

## Resources

- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API)
- [next-pwa Documentation](https://github.com/shadowwalker/next-pwa)
