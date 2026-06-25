/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['canteen.szvtech.org', 'localhost:3000'],
    },
  },

  // Force a fresh build ID so Vercel's incremental build cache is busted.
  // The previous middleware used @supabase/ssr which leaked __dirname into the
  // edge bundle.  Vercel kept restoring that stale cached bundle even after the
  // middleware was rewritten, because the webpack chunk hashes didn't change.
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },

  // Polyfill __dirname for the Edge Runtime so any residual reference from a
  // cached bundle cannot crash with "ReferenceError: __dirname is not defined".
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === 'edge') {
      const { DefinePlugin } = require('webpack')
      config.plugins.push(
        new DefinePlugin({
          __dirname: JSON.stringify('/'),
        })
      )
    }
    return config
  },
}

module.exports = nextConfig
