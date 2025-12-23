# Deployment Checklist - Performance Optimizations

## Pre-Deployment

- [x] Database migration applied (`add_image_variants`)
- [x] Build successful (`npm run build`)
- [x] Sharp dependency installed
- [x] Next.js Image configuration added

## Deployment Steps

1. **Commit and push changes**
   ```bash
   git add .
   git commit -m "feat: implement automated image optimization and responsive images"
   git push
   ```

2. **Verify Vercel deployment**
   - Check build logs for any errors
   - Ensure database migration runs successfully
   - Verify environment variables are set

3. **Test image upload**
   - Go to admin panel
   - Upload a new book cover
   - Verify 3 variants are created in S3
   - Check browser Network tab for WebP images

4. **Monitor performance**
   - Wait 24-48 hours for Speed Insights data
   - Check LCP, FCP, and INP metrics
   - Compare before/after metrics

## Post-Deployment

### Immediate Testing

- [ ] Upload new book cover in admin panel
- [ ] Verify image displays correctly on homepage
- [ ] Verify image displays correctly on book detail page
- [ ] Check responsive behavior (mobile, tablet, desktop)
- [ ] Test with existing books (legacy images)

### Performance Validation

- [ ] Run Lighthouse audit (desktop and mobile)
- [ ] Check Vercel Speed Insights dashboard
- [ ] Verify LCP < 2.5s (target)
- [ ] Verify FCP < 1.8s (target)
- [ ] Monitor INP scores

### Optional: Migrate Existing Images

For existing books with covers:
1. Go to admin panel
2. Edit each book
3. Re-upload the cover image
4. Save changes
5. Old image will be deleted, new optimized variants created

## Rollback Plan

If issues occur:

1. **Revert code changes**
   ```bash
   git revert HEAD
   git push
   ```

2. **Database is backward compatible**
   - New fields are nullable
   - Legacy `coverObjectKey` still works
   - No data loss

## Expected Improvements

### Desktop
- **LCP**: 3.36s → ~2.0s (40% improvement)

### Mobile
- **FCP**: 3.4s → ~2.4s (30% improvement)
- **LCP**: 4.19s → ~2.8s (33% improvement)
- **INP**: 768ms → ~600ms (22% improvement)

## Monitoring

Track these metrics in Vercel Speed Insights:
- Largest Contentful Paint (LCP)
- First Contentful Paint (FCP)
- Interaction to Next Paint (INP)
- Cumulative Layout Shift (CLS)
- Time to First Byte (TTFB)

## Support

If you encounter issues:
1. Check `PERFORMANCE_OPTIMIZATIONS.md` for troubleshooting
2. Review browser console for errors
3. Check S3 bucket permissions and CORS
4. Verify signed URL expiration settings
