/** @type {import('next').NextConfig} */
const nextConfig = {
  // experimental appDir 제거 (Next.js 14에서는 기본값)
  
  // PWA 설정을 위한 준비
  async redirects() {
    // Consolidate public search pages only. Legacy tabs/PWAs must still reach
    // same-origin APIs, OAuth callbacks, service workers and app screens.
    // Preview deployment hosts are deliberately not matched.
    return ['/', '/about', '/faq', '/privacy', '/terms'].map((path) => ({
      source: path,
      has: [{ type: 'host', value: 'gatitagachon.vercel.app' }],
      destination: `https://gatita.kro.kr${path}`,
      permanent: true,
    }));
  },
  async rewrites() {
    return [
      {
        source: '/service-worker.js',
        destination: '/sw.js',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
