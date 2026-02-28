"""
Tests for cache utility
"""
import pytest
import time
from utils.cache import SimpleCache, cache


def test_cache_set_and_get():
    """Test setting and getting from cache"""
    test_cache = SimpleCache()
    
    # Set value
    test_cache.set("test_key", "test_value", ttl=60)
    
    # Get value
    value = test_cache.get("test_key")
    assert value == "test_value"


def test_cache_expiration():
    """Test cache expiration"""
    test_cache = SimpleCache()
    
    # Set value with short TTL
    test_cache.set("test_key", "test_value", ttl=1)
    
    # Get immediately (should work)
    value = test_cache.get("test_key")
    assert value == "test_value"
    
    # Wait for expiration
    time.sleep(1.1)
    
    # Get after expiration (should return None)
    value = test_cache.get("test_key")
    assert value is None


def test_cache_delete():
    """Test deleting from cache"""
    test_cache = SimpleCache()
    
    # Set value
    test_cache.set("test_key", "test_value")
    
    # Delete
    test_cache.delete("test_key")
    
    # Get should return None
    value = test_cache.get("test_key")
    assert value is None


def test_cache_clear():
    """Test clearing cache"""
    test_cache = SimpleCache()
    
    # Set multiple values
    test_cache.set("key1", "value1")
    test_cache.set("key2", "value2")
    test_cache.set("key3", "value3")
    
    # Clear
    test_cache.clear()
    
    # All should be None
    assert test_cache.get("key1") is None
    assert test_cache.get("key2") is None
    assert test_cache.get("key3") is None


def test_cache_invalidate_pattern():
    """Test invalidating cache by pattern"""
    test_cache = SimpleCache()
    
    # Set values with patterns
    test_cache.set("user:stats:user1@example.com", {"points": 100})
    test_cache.set("user:stats:user2@example.com", {"points": 200})
    test_cache.set("modules:map:user1@example.com", [])
    test_cache.set("other:key", "value")
    
    # Invalidate user stats pattern
    test_cache.invalidate_pattern("user:stats:")
    
    # User stats should be None
    assert test_cache.get("user:stats:user1@example.com") is None
    assert test_cache.get("user:stats:user2@example.com") is None
    
    # Other keys should still exist
    assert test_cache.get("modules:map:user1@example.com") is not None
    assert test_cache.get("other:key") is not None


def test_cache_default_ttl():
    """Test default TTL"""
    test_cache = SimpleCache(default_ttl=2)
    
    # Set value without TTL (should use default)
    test_cache.set("test_key", "test_value")
    
    # Get immediately (should work)
    value = test_cache.get("test_key")
    assert value == "test_value"
    
    # Wait for expiration
    time.sleep(2.1)
    
    # Get after expiration (should return None)
    value = test_cache.get("test_key")
    assert value is None


def test_global_cache_instance():
    """Test global cache instance"""
    # Set value in global cache
    cache.set("global_key", "global_value", ttl=60)
    
    # Get value
    value = cache.get("global_key")
    assert value == "global_value"
    
    # Clear for cleanup
    cache.delete("global_key")
