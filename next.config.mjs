/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['sharp', 'satori'],
  // Ensure WASM files (satori's HarfBuzz for Arabic shaping) are included in Vercel bundles
  outputFileTracingIncludes: {
    '/api/qr/[token]': ['./node_modules/**/*.wasm', './node_modules/satori/**/*'],
  },
};

export default nextConfig;
