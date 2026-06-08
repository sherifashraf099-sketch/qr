/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // sharp is a native module — must not be bundled by Next.js webpack
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
