# Audio Shelf

An audiobook streaming platform built with Next.js, featuring private audio storage with signed URLs.

## Features

- **Public Library**: Browse and play audiobooks with a YouTube Music-style sticky player
- **Admin Dashboard**: Upload audiobooks with presigned URLs (direct-to-S3 uploads)
- **Private Audio**: Audio files are stored privately and accessed via short-lived signed URLs
- **Simple Auth**: Password-protected admin area (Phase 1)

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
| GET | `/api/books` | List all books with audio info |
| POST | `/api/books/[id]/play-url` | Get signed URL for playback (300s TTL) |
| POST | `/api/admin/upload-url` | Get presigned upload URL (admin) |
| POST | `/api/admin/books` | Create book record (admin) |

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── books/           # Public API routes
│   │   └── admin/           # Protected admin routes
│   ├── admin/               # Admin pages
│   └── page.tsx             # Public homepage
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── book-card.tsx
│   ├── book-list.tsx
│   ├── audio-player-bar.tsx
│   └── admin-upload-form.tsx
├── lib/
│   ├── db.ts                # Prisma client
│   ├── s3.ts                # S3 utilities
│   ├── validators.ts        # Zod schemas
│   └── types.ts             # TypeScript types
├── prisma/
│   └── schema.prisma        # Database schema
└── middleware.ts            # Admin auth middleware
```

## Security Notes

- Audio files are **private by default** - accessed only via short-lived signed URLs (5 min TTL)
- Admin routes are protected by password middleware
- No secrets are exposed to client bundles
- For production, consider:
  - Using a proper auth solution (NextAuth, Clerk, etc.)
  - Adding rate limiting
  - Implementing HTTPS-only cookies

## Future Enhancements (Phase 2+)

- [ ] User authentication and personal libraries
- [ ] Chapters and bookmarks
- [ ] Playback progress tracking
- [ ] Cover image uploads
- [ ] Search and filtering
- [ ] Public/private book visibility toggle

## License

MIT
