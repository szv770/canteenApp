/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['canteen.szvtech.org', 'localhost:3000'],
    },
  },
}

module.exports = nextConfig
