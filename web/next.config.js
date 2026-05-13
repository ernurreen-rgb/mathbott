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
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
    },
  },
  {
    hideSourceMaps: true,
  }
);

