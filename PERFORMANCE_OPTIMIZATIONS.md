# Performance Optimizations

This document outlines the performance optimizations implemented to improve Vercel Speed Insights metrics.

## Issues Addressed

### Desktop
- **Largest Contentful Paint (LCP)**: 3.36s → Target: <2.5s

### Mobile
- **First Contentful Paint (FCP)**: 3.4s → Target: <1.8s
- **Largest Contentful Paint (LCP)**: 4.19s → Target: <2.5s
- **Interaction to Next Paint (INP)**: 768ms → Target: <200ms

## Implemented Optimizations

### 1. Automated Image Optimization Pipeline

**Location**: `lib/image-optimizer.ts`, `app/api/admin/optimize-image/route.ts`

When uploading book covers in the admin panel, images are now automatically:
- **Resized** to three variants:
  - Thumbnail: 320×180px
  - Medium: 640×360px
  - Large: 1280×720px
- **Converted** to WebP format (better compression than JPEG/PNG)
- **Optimized** with 85% quality setting
- **Validated** for minimum dimensions (320×180px) and maximum size (10MB)

**Benefits**:
- Smaller file sizes (WebP typically 25-35% smaller than JPEG)
- Faster downloads
- Automatic processing on upload

### 2. Responsive Images with Next.js Image Component

**Location**: `components/responsive-book-cover.tsx`

Replaced plain `<img>` tags with Next.js `Image` component that provides:
- **Automatic srcset generation** for different screen sizes
- **Lazy loading** for images below the fold
- **Priority loading** for LCP images (book detail page)
- **Automatic format optimization**
- **Built-in blur placeholder** support

**Sizes configuration**:
```
(max-width: 640px) 100vw    // Mobile: full width
(max-width: 1024px) 50vw     // Tablet: half width
33vw                          // Desktop: third width
```

### 3. Database Schema Updates

**Location**: `prisma/schema.prisma`

Added fields to store multiple image variants:
- `coverThumbnailKey` - 320×180 WebP
- `coverMediumKey` - 640×360 WebP
- `coverLargeKey` - 1280×720 WebP
- `coverObjectKey` - Legacy field (kept for backward compatibility)

### 4. Font Optimization

**Location**: `app/layout.tsx`

- **Removed unused fonts**: Geist and Geist_Mono (reduced font payload)
- **Added font-display: swap**: Prevents invisible text during font loading
- **Enabled preload**: Prioritizes font loading
- **Single font family**: JetBrains Mono only

**Impact**: Reduced font loading time and prevented layout shift

### 5. Next.js Configuration

**Location**: `next.config.ts`

- Configured remote image patterns for S3 signed URLs
- Enables Next.js Image optimization for external images

### 6. Metadata Improvements

**Location**: `app/layout.tsx`

- Added viewport meta tag
- Added theme-color for better mobile appearance
- Proper SEO metadata

## API Changes

### Upload Flow (Admin Panel)

**Before**:
1. Upload image directly to S3
2. Store single object key

**After**:
1. Upload image to `/api/admin/optimize-image`
2. Server generates 3 optimized variants
3. Upload all variants to S3
4. Store all variant keys in database

### Book API Responses

All book endpoints now return:
```typescript
{
  coverUrl: string | null,           // Default (medium)
  coverThumbnailUrl: string | null,  // 320×180
  coverMediumUrl: string | null,     // 640×360
  coverLargeUrl: string | null,      // 1280×720
}
```

## Usage

### For New Images

Simply upload images through the admin panel - optimization happens automatically.

### For Existing Images

Existing images will continue to work (legacy `coverObjectKey` support maintained). To optimize existing images:

1. Re-upload the cover image in the admin panel
2. The old image will be automatically deleted
3. New optimized variants will be generated

## Performance Impact

### Expected Improvements

1. **LCP Improvement**: 30-50% reduction
   - Smaller image sizes
   - Priority loading for above-fold images
   - Responsive images serve appropriate sizes

2. **FCP Improvement**: 20-30% reduction
   - Reduced font payload
   - Font-display: swap prevents FOIT

3. **INP Improvement**: Minimal direct impact
   - Consider code splitting for large components
   - Defer non-critical JavaScript

### Monitoring

Use Vercel Speed Insights to track improvements:
- Deploy changes
- Wait 24-48 hours for data collection
- Compare metrics before/after

## Additional Recommendations

### Further Optimizations

1. **Static Generation**: Convert pages to SSG where possible
   ```typescript
   export const dynamic = 'force-static';
   ```

2. **Code Splitting**: Lazy load heavy components
   ```typescript
   const HeavyComponent = dynamic(() => import('./HeavyComponent'));
   ```

3. **Preconnect to S3**: Add to `<head>`
   ```html
   <link rel="preconnect" href="https://your-s3-domain.com" />
   ```

4. **Service Worker**: Cache images and API responses

5. **CDN**: Consider CloudFront in front of S3 for better caching

### Image Best Practices

- Upload high-quality source images (1280×720 or larger)
- Use 16:9 aspect ratio for consistency
- Avoid uploading already-compressed images
- Maximum 10MB upload size

## Troubleshooting

### Images not displaying

1. Check S3 bucket CORS configuration
2. Verify signed URL expiration (default: 1 hour)
3. Check browser console for errors

### Optimization failing

1. Ensure image meets minimum dimensions (320×180px)
2. Check file size (<10MB)
3. Verify image format (JPEG, PNG, WebP supported)

### Migration issues

1. Old images still work via `coverObjectKey`
2. Re-upload to generate new variants
3. Database migration is automatic (already applied)
