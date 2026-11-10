# Build stage
FROM python:3.11-slim AS builder

WORKDIR /app

ENV PYTHONUSERBASE=/install

# Install system dependencies for building
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --user -r requirements.txt

# Production stage
FROM python:3.11-slim

WORKDIR /app

# Copy only installed packages from builder
COPY --from=builder /install /usr/local

# Apply Debian security updates the base image does not carry yet (e.g. zlib1g).
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Replace the base image's vulnerable vendored jaraco.context and wheel copies.
RUN python -m pip install --no-cache-dir --upgrade "setuptools==80.10.2"

# Create a non-root runtime user and writable runtime directories
RUN groupadd --system appuser \
    && useradd --system --gid appuser --home-dir /app --shell /usr/sbin/nologin appuser \
    && mkdir -p /app/data /data /images \
    && chown -R appuser:appuser /app /data /images

# Copy application code
COPY --chown=appuser:appuser . .

# Make sure installed package scripts are usable
ENV PATH=/usr/local/bin:$PATH

# Expose port
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

USER appuser

# Run the application
CMD ["python", "main.py"]

