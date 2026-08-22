import { MetadataRoute } from 'next';

/**
 * @fileOverview Generates sitemap.xml for full site indexing.
 * Includes all new production hubs.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.12labs.in';

  const staticRoutes = [
    { url: '/', priority: 1.0, changeFrequency: 'daily' },
    { url: '/studio', priority: 0.9, changeFrequency: 'weekly' },
    { url: '/pro-studio', priority: 0.9, changeFrequency: 'weekly' },
    { url: '/new-ai-studio', priority: 0.9, changeFrequency: 'weekly' },
    { url: '/store', priority: 0.9, changeFrequency: 'daily' },
    { url: '/music-studio', priority: 0.8, changeFrequency: 'weekly' },
    { url: '/music-library', priority: 0.8, changeFrequency: 'daily' },
    { url: '/script-generator', priority: 0.8, changeFrequency: 'monthly' },
    { url: '/seo-kit', priority: 0.8, changeFrequency: 'monthly' },
    { url: '/pdf-tools', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/voice-cloning', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/buy-credits', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/sound-search', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/youtube-thumbnail-downloader', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/youtube-transcript', priority: 0.7, changeFrequency: 'monthly' },
    { url: '/docs', priority: 0.8, changeFrequency: 'weekly' },
  ];

  const routes = staticRoutes.map((route) => ({
    url: `${baseUrl}${route.url}`,
    lastModified: new Date().toISOString(),
    changeFrequency: route.changeFrequency as any,
    priority: route.priority,
  }));

  return routes;
}