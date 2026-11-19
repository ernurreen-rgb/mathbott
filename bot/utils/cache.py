"""
Simple bounded in-memory LRU cache with TTL for frequently accessed data.
"""
from collections import OrderedDict
import time
from typing import Any, Optional


class SimpleCache:
    """Bounded in-memory LRU cache with TTL eviction."""

    def __init__(self, default_ttl: int = 300, maxsize: int = 2048):
        self.cache: "OrderedDict[str, tuple[Any, float]]" = OrderedDict()
        self.default_ttl = default_ttl
        self.maxsize = max(1, int(maxsize))

    def _evict_expired(self, now: float) -> None:
        expired = [key for key, (_, expiry) in self.cache.items() if now > expiry]
        for key in expired:
            self.cache.pop(key, None)

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired."""
        entry = self.cache.get(key)
        if entry is None:
            return None

        value, expiry = entry
        if time.time() > expiry:
            self.cache.pop(key, None)
            return None

        self.cache.move_to_end(key)
        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache with TTL and bounded LRU size."""
        now = time.time()
        ttl_seconds = self.default_ttl if ttl is None else ttl
        expiry = now + ttl_seconds
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = (value, expiry)
        if len(self.cache) > self.maxsize:
            self._evict_expired(now)
            while len(self.cache) > self.maxsize:
                self.cache.popitem(last=False)

    def delete(self, key: str) -> None:
        """Delete key from cache."""
        self.cache.pop(key, None)

    def clear(self) -> None:
        """Clear all cache."""
        self.cache.clear()

    def invalidate_pattern(self, pattern: str) -> None:
        """Invalidate all keys matching pattern."""
        keys_to_delete = [key for key in list(self.cache.keys()) if pattern in key]
        for key in keys_to_delete:
            self.cache.pop(key, None)


# Global cache instance
cache = SimpleCache(default_ttl=300, maxsize=2048)
