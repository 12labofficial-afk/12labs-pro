import { MetadataRoute } from 'next';

/**
 * @fileOverview Generates robots.txt to control search engine crawling.
 * Fully optimized for new tools indexing.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.12labs.in';
  
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/studio',
        '/store',
        '/script-generator',
        '/seo-kit',
        '/sound-search',
        '/youtube-thumbnail-downloader',
        '/voice-cloning',
        '/youtube-transcript',
        '/pdf-tools',
        '/new-ai-studio',
        '/music-studio',
        '/music-library',
      ],
      disallow: [
        '/admin/',
        '/seller/',
        '/payouts/',
        '/history/',
        '/store/checkout/',
        '/login',
        '/forgot-password',
        '/verify-email',
        '/api/',
        '/_next/',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
