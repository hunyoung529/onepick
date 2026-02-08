/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image-comic.pstatic.net' },
      { protocol: 'https', hostname: 'shared-comic.pstatic.net' },
      { protocol: 'https', hostname: 'ssl.pstatic.net' },
    ],
  },
};

export default nextConfig;
