import type { MetadataRoute } from 'next';

/** Search engines may read the catalogue, never the admin panel or its API. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/admin'] },
  };
}
