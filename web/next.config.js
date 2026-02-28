const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
  },
};

module.exports = withSentryConfig(
  nextConfig,
  {
    silent: true,
    disableLogger: true,
  },
  {
    hideSourceMaps: true,
  }
);

