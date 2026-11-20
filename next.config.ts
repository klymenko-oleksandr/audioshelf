import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The generated cover PNGs read their fonts from disk; make sure they ship with the routes.
  outputFileTracingIncludes: {
    '/api/cover/[slug]': ['./lib/cover-image/*.woff'],
    '/book/[slug]/opengraph-image': ['./lib/cover-image/*.woff'],
  },
};

export default withNextIntl(nextConfig);
