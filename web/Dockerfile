# syntax=docker/dockerfile:1
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY .npmrc ./
COPY tools/minimatch-compat ./tools/minimatch-compat

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build-time public config and Sentry source map upload credentials
ARG NEXT_PUBLIC_API_URL=/api/backend
ARG NEXT_PUBLIC_WS_API_URL=
ARG NEXT_PUBLIC_MODULES_UI_ENABLED=true
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=

# Build the application
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN npm run build

# Production image
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S appuser && adduser -S appuser -G appuser

# Copy package files
COPY package*.json ./
COPY .npmrc ./
COPY tools/minimatch-compat ./tools/minimatch-compat

# Install production dependencies only
RUN npm ci --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Copy built application from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

RUN chown -R appuser:appuser /app

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER appuser

# Run the application
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0"]

