"""Health check endpoint tests (P0 - Critical)"""
import pytest


def test_health_check(client):
    """Test GET /health endpoint"""
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "ok"
    assert "version" in data
    assert "registered_faces" in data
    assert isinstance(data["registered_faces"], int)
    assert data["registered_faces"] >= 0


def test_root_endpoint(client):
    """Test GET / endpoint"""
    response = client.get("/")

    assert response.status_code == 200
    data = response.json()

    assert data["service"] == "Face API Server"
    assert "version" in data
    assert data["status"] == "running"


def test_health_check_no_auth_required(client):
    """Test that health check doesn't require authentication"""
    response = client.get("/health")

    # Should succeed without x-api-key header
    assert response.status_code == 200
