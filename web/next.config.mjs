/**
 * Besides the sandbox and the CSP inside every page (web/src/lib/containment.ts),
 * the browser page itself limits what a frame may navigate to: a surviving
 * <meta refresh> inside a published page cannot send its frame to a real site.
 */
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-src about:; object-src 'none'; base-uri 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
