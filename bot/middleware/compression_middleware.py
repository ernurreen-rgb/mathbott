"""
Middleware for compressing responses with gzip

NOTE: Currently disabled in app.py due to ERR_CONTENT_LENGTH_MISMATCH errors.
The issue occurs when compressing responses containing UTF-8 characters (e.g., Kazakh text),
where the Content-Length header doesn't match the actual compressed body size.

TODO: Fix by:
1. Properly calculating Content-Length after compression
2. Using uvicorn's built-in compression instead
3. Or handling encoding issues when reading response body
"""
import gzip
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, StreamingResponse

logger = logging.getLogger(__name__)


class CompressionMiddleware(BaseHTTPMiddleware):
    """Middleware to compress responses with gzip"""
    
    async def dispatch(self, request: Request, call_next):
        """Compress response if client supports it"""
        # Check if client accepts gzip encoding
        accept_encoding = request.headers.get("accept-encoding", "").lower()
        
        if "gzip" not in accept_encoding:
            # Client doesn't support gzip, return response as-is
            return await call_next(request)
        
        # Process request
        response = await call_next(request)
        
        # Only compress if response is large enough and is JSON/text
        content_type = response.headers.get("content-type", "").lower()
        should_compress = (
            content_type.startswith("application/json") or
            content_type.startswith("text/")
        ) and response.status_code == 200
        
        if not should_compress:
            return response
        
        # Get response body
        body = b""
        try:
            if hasattr(response, 'body'):
                body = response.body
            elif hasattr(response, 'body_iterator'):
                # For streaming responses, read the body
                async for chunk in response.body_iterator:
                    if isinstance(chunk, bytes):
                        body += chunk
                    else:
                        body += chunk.encode('utf-8')
            else:
                # Try to read from response directly
                if hasattr(response, 'render'):
                    body = response.render({})
                else:
                    return response
        except Exception as e:
            logger.warning(f"Error reading response body for compression: {e}")
            return response
        
        # Only compress if body is large enough (>1KB)
        if len(body) < 1024:
            return response
        
        # Compress body
        try:
            compressed_body = gzip.compress(body, compresslevel=6)
            
            # Create new response with compressed body
            # Remove original content-length before creating new response
            headers = dict(response.headers)
            headers.pop("content-length", None)  # Remove old content-length
            
            compressed_response = Response(
                content=compressed_body,
                status_code=response.status_code,
                headers=headers,
                media_type=response.media_type
            )
            compressed_response.headers["content-encoding"] = "gzip"
            compressed_response.headers["content-length"] = str(len(compressed_body))
            
            return compressed_response
        except Exception as e:
            logger.error(f"Error compressing response: {e}", exc_info=True)
            return response
