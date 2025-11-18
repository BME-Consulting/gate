"""API authentication tests (P0 - Critical)"""
import pytest


def test_register_without_api_key(client, sample_base64_image):
    """Test that /api/face/register requires API key"""
    response = client.post(
        "/api/face/register",
        json={
            "person_id": "TEST001",
            "image_data": sample_base64_image
        }
    )

    assert response.status_code == 401
    assert "detail" in response.json()


def test_register_with_invalid_api_key(client, sample_base64_image):
    """Test that /api/face/register rejects invalid API key"""
    response = client.post(
        "/api/face/register",
        json={
            "person_id": "TEST001",
            "image_data": sample_base64_image
        },
        headers={"x-api-key": "invalid-key"}
    )

    assert response.status_code == 401
    assert "detail" in response.json()


def test_register_with_valid_api_key(client, sample_base64_image, auth_headers):
    """Test that /api/face/register accepts valid API key"""
    response = client.post(
        "/api/face/register",
        json={
            "person_id": "TEST001",
            "image_data": sample_base64_image
        },
        headers=auth_headers
    )

    # Should not be 401 (may fail with other error due to invalid image)
    assert response.status_code != 401


def test_recognize_without_api_key(client, sample_base64_image):
    """Test that /api/face/recognize requires API key"""
    response = client.post(
        "/api/face/recognize",
        json={
            "image_data": sample_base64_image,
            "threshold": 0.6
        }
    )

    assert response.status_code == 401
    assert "detail" in response.json()


def test_recognize_with_invalid_api_key(client, sample_base64_image):
    """Test that /api/face/recognize rejects invalid API key"""
    response = client.post(
        "/api/face/recognize",
        json={
            "image_data": sample_base64_image,
            "threshold": 0.6
        },
        headers={"x-api-key": "invalid-key"}
    )

    assert response.status_code == 401
    assert "detail" in response.json()


def test_recognize_with_valid_api_key(client, sample_base64_image, auth_headers):
    """Test that /api/face/recognize accepts valid API key"""
    response = client.post(
        "/api/face/recognize",
        json={
            "image_data": sample_base64_image,
            "threshold": 0.6
        },
        headers=auth_headers
    )

    # Should not be 401 (may return null person_id due to invalid image)
    assert response.status_code != 401
