
/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
  productionBrowserSourceMaps: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    // Tree-shake the big barrel-import libraries so a page that uses three
    // lucide icons doesn't pull in all ~1,500 of them. This is the single
    // biggest client-bundle win here and is safe — Next just rewrites the
    // imports, it doesn't change behaviour.
    // Only packages listed in package.json — an unknown name here just
    // logs a warning and is skipped, but keeping the list accurate avoids
    // noise. 'motion' (v12) is what framer-motion imports resolve through.
    optimizePackageImports: [
      'lucide-react',
      'motion',
      'date-fns',
      'recharts',
    ],
  },
  onDemandEntries: {
    maxInactiveAge: 10 * 1000,
    pagesBufferLength: 1,
  },
  async redirects() {
    return [
      {
        source: '/voice-india',
        destination: '/studio',
        permanent: true,
      },
      {
        source: '/voice-india/:path*',
        destination: '/studio',
        permanent: true,
      },
      // 🔴 CLEANUP: there used to be TWO thumbnail-downloader routes —
      // /thumbnail-downloader (noindex stub) client-redirecting to
      // /youtube-thumbnail-downloader, which itself client-redirected to
      // /thumbnail-generator?mode=download. That's a double hop through a
      // deleted page for zero benefit. /thumbnail-downloader is removed
      // entirely now; this sends any old/bookmarked/indexed link straight
      // to the one real tool in a single server-side redirect.
      // /youtube-thumbnail-downloader stays as-is — it's the actual SEO
      // landing page (sitemap.ts, features-section.tsx, maintenance-guard.tsx
      // all point at it), so it isn't touched here.
      {
        source: '/thumbnail-downloader',
        destination: '/thumbnail-generator?mode=download',
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'drive.google.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.12labs.in',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'blogger.googleusercontent.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
  // Only public values here — anything in `env` is inlined into the browser
  // bundle wherever it's referenced. Server secrets (HF_TOKEN, H1-H3, C2)
  // used to be mirrored here as NEXT_PUBLIC_*; read them via process.env
  // on the server instead.
  env: {
    NEXT_PUBLIC_VAPID: process.env.NEXT_PUBLIC_VAPID,
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          // Clickjacking: no other site may frame our pages (admin panel,
          // payment buttons).
          key: 'X-Frame-Options',
          value: 'SAMEORIGIN',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=(), otp-credentials=(self)',
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ],
    },
  ],
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        'node:buffer': 'buffer',
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve('buffer'),
        fs: false,
        path: false,
        stream: false,
        zlib: false,
        os: false,
        net: false,
        tls: false,
        http2: false,
      };
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        })
      );
    }

    return config;
  },
};

module.exports = nextConfig;
