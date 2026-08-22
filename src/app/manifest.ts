
import { MetadataRoute } from 'next';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Keep PWA icons local and deterministic. A dynamically configured logo can
  // be low-resolution or return different crops on different devices.
  const getIconUrl = (size: number) => `/icon-${size}.png`;

  return {
    id: '/',
    name: '12Labs AI Studio',
    short_name: '12Labs',
    description: 'The Ultimate AI Studio for Indian Creators.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    scope: '/',
    icons: [
      {
        src: getIconUrl(192),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: getIconUrl(512),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Open Studio',
        url: '/studio',
        icons: [{ src: getIconUrl(192), sizes: '192x192' }],
      },
      {
        name: 'Digital Store',
        url: '/store',
        icons: [{ src: getIconUrl(192), sizes: '192x192' }],
      }
    ]
  };
}
