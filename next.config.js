/** @type {import('next').NextConfig} */
const nextConfig = {
  // experimental appDir 제거 (Next.js 14에서는 기본값)
  
  // PWA 설정을 위한 준비
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
