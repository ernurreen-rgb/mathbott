"""
Tests for metrics utility
"""
import pytest
import time
from utils.metrics import MetricsCollector, metrics


def test_metrics_collector_record_request():
    """Test recording a request"""
    collector = MetricsCollector()
    
    # Record request
    collector.record_request("/api/test", 0.1, 200)
    
    # Check stats
    stats = collector.get_stats()
    assert stats["total_requests"] == 1
    assert stats["avg_response_time"] == 0.1
    assert stats["endpoint_counts"]["/api/test"] == 1


def test_metrics_collector_record_error():
    """Test recording an error"""
    collector = MetricsCollector()
    
    # Record error
    collector.record_request("/api/test", 0.1, 404)
    
    # Check stats
    stats = collector.get_stats()
    assert stats["error_count"] == 1
    assert "/api/test:404" in stats["error_breakdown"]


def test_metrics_collector_multiple_requests():
    """Test recording multiple requests"""
    collector = MetricsCollector()
    
    # Record multiple requests
    collector.record_request("/api/test1", 0.1, 200)
    collector.record_request("/api/test2", 0.2, 200)
    collector.record_request("/api/test1", 0.15, 200)
    
    # Check stats
    stats = collector.get_stats()
    assert stats["total_requests"] == 3
    assert stats["endpoint_counts"]["/api/test1"] == 2
    assert stats["endpoint_counts"]["/api/test2"] == 1


def test_metrics_collector_response_times():
    """Test response time statistics"""
    collector = MetricsCollector()
    
    # Record requests with different response times
    collector.record_request("/api/test", 0.1, 200)
    collector.record_request("/api/test", 0.2, 200)
    collector.record_request("/api/test", 0.3, 200)
    
    # Check stats
    stats = collector.get_stats()
    assert stats["min_response_time"] == 0.1
    assert stats["max_response_time"] == 0.3
    assert stats["avg_response_time"] == pytest.approx(0.2, rel=0.1)


def test_metrics_collector_reset():
    """Test resetting metrics"""
    collector = MetricsCollector()
    
    # Record some requests
    collector.record_request("/api/test", 0.1, 200)
    collector.record_request("/api/test", 0.2, 404)
    
    # Reset
    collector.reset()
    
    # Check stats (should be empty)
    stats = collector.get_stats()
    assert stats["total_requests"] == 0
    assert stats["error_count"] == 0
    assert len(stats["endpoint_counts"]) == 0


def test_metrics_collector_max_history():
    """Test max history limit"""
    collector = MetricsCollector()
    collector.max_history = 5  # Set small limit for testing
    
    # Record more requests than max_history
    for i in range(10):
        collector.record_request("/api/test", 0.1, 200)
    
    # Should only keep last 5
    stats = collector.get_stats()
    assert stats["total_requests"] == 5


def test_global_metrics_instance():
    """Test global metrics instance"""
    # Record request in global instance
    metrics.record_request("/api/test", 0.1, 200)
    
    # Get stats
    stats = metrics.get_stats()
    assert stats["total_requests"] >= 1
    
    # Reset for cleanup
    metrics.reset()
