# Audio Shelf

An audiobook streaming platform built with Next.js, featuring private audio storage with signed URLs.

## Features

### Library & Playback
- **Public Library**: Browse audiobooks with cover images, duration, and chapter count
- **Book Details Page**: View book info, description, and chapter list
- **Persistent Audio Player**: YouTube Music-style sticky player that persists across page navigation
- **Chapter Navigation**: Play individual chapters, skip forward/back
- **Progress Tracking**: Automatically saves and restores playback position per session

### Admin Dashboard
- **Upload Audiobooks**: Direct-to-S3 uploads with presigned URLs
- **Multi-Chapter Support**: Upload multiple audio files per book with reordering
- **Cover Image Uploads**: Upload cover images (JPG, PNG, WebP) with preview
- **Edit Books**: Modify title, author, description, cover, and chapters
- **Delete Books**: Remove books with automatic S3 cleanup
- **Password Protected**: Simple password authentication

### Storage & Security
- **Private Audio**: Audio files accessed only via short-lived signed URLs (5 min TTL)
- **S3-Compatible**: Works with Cloudflare R2, AWS S3, or any S3-compatible storage
- **Cover Images**: Stored in S3 with signed URLs for display

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Storage**: S3-compatible (Cloudflare R2 / AWS S3)
- **UI**: shadcn/ui + Tailwind CSS
- **Validation**: Zod

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- S3-compatible storage (Cloudflare R2 recommended)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

**Required variables:**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ADMIN_PASSWORD` | Password for admin access |
| `S3_ENDPOINT` | S3-compatible endpoint URL |
| `S3_REGION` | S3 region (use `auto` for R2) |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_BUCKET` | Bucket name for audio storage |

### 3. Set Up Database

```bash
npx prisma migrate dev --name init
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public library.

Open [http://localhost:3000/admin](http://localhost:3000/admin) for the admin dashboard.

## S3 / Cloudflare R2 Setup

### Cloudflare R2

1. Create a bucket in Cloudflare R2
2. Generate an API token with read/write permissions
3. Set `S3_ENDPOINT` to `https://<account-id>.r2.cloudflarestorage.com`
4. Set `S3_REGION` to `auto`

### CORS Configuration

Add this CORS policy to your bucket:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-domain.com"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/books` | List all books with chapters and cover URLs |
| GET | `/api/books/[id]` | Get single book details |
| POST | `/api/books/[id]/play-url` | Get signed URL for chapter playback (5 min TTL) |
| GET | `/api/books/[id]/progress` | Get playback progress for session |
| POST | `/api/books/[id]/progress` | Save playback progress |
| POST | `/api/admin/upload-url` | Get presigned upload URL for audio/cover (admin) |
| POST | `/api/admin/books` | Create book with chapters (admin) |
| GET | `/api/admin/books/[id]` | Get book for editing (admin) |
| PUT | `/api/admin/books/[id]` | Update book (admin) |
| DELETE | `/api/admin/books/[id]` | Delete book and S3 files (admin) |

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── books/              # Public API routes
│   │   │   └── [id]/           # Book details, play-url, progress
│   │   └── admin/              # Protected admin routes
│   │       ├── books/          # CRUD operations
│   │       └── upload-url/     # Presigned URL generation
│   ├── admin/                  # Admin pages
│   │   └── books/[id]/edit/    # Edit book page
│   ├── books/[id]/             # Book details page
│   └── page.tsx                # Public homepage
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── audio-player-context.tsx # Global audio state
│   ├── global-audio-player.tsx  # Persistent player
│   ├── admin-book-form.tsx     # Create/edit book form
│   ├── admin-book-list.tsx     # Admin book management
│   ├── book-card.tsx           # Book card component
│   └── book-list.tsx           # Book grid
├── lib/
│   ├── db.ts                   # Prisma client
│   ├── s3.ts                   # S3 utilities
│   ├── session.ts              # Session ID management
│   ├── validators.ts           # Zod schemas
│   └── types.ts                # TypeScript types
├── prisma/
│   └── schema.prisma           # Database schema
└── middleware.ts               # Admin auth middleware
```

## Security Notes

- Audio files are **private by default** - accessed only via short-lived signed URLs (5 min TTL)
- Admin routes are protected by password middleware
- No secrets are exposed to client bundles
- For production, consider:
  - Using a proper auth solution (NextAuth, Clerk, etc.)
  - Adding rate limiting
  - Implementing HTTPS-only cookies

## Future Enhancements

- [ ] User authentication and personal libraries
- [ ] Bookmarks within chapters
- [ ] Search and filtering
- [ ] Public/private book visibility toggle
- [ ] Playback speed control
- [ ] Sleep timer

## Changelog

### v0.5.0 (Current)
- Book details page with chapter list
- Persistent audio player across page navigation
- Play individual chapters from book details
- Edit existing books (title, author, description, cover, chapters)
- Description field for books (5000 char limit)
- Cover image upload hints (size, ratio, format)

### v0.4.0
- Multi-chapter audiobook support
- Chapter navigation (skip forward/back)
- Unified progress tracking across chapters
- Delete books with S3 cleanup
- Cover image uploads to S3

### v0.3.0
- Playback progress saving/restoring
- Session-based progress tracking

### v0.2.0
- Admin dashboard with upload form
- Direct-to-S3 uploads with presigned URLs

### v0.1.0
- Initial release
- Public library with audio player
- Password-protected admin area

## License

MIT
