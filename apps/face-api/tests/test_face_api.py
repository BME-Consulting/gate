"""Face API endpoint tests (P0 - Critical)"""
import pytest


class TestFaceRegistration:
    """Face registration API tests"""

    def test_register_missing_person_id(self, client, sample_base64_image, auth_headers):
        """Test registration fails without person_id"""
        response = client.post(
            "/api/face/register",
            json={"image_data": sample_base64_image},
            headers=auth_headers
        )

        assert response.status_code == 422  # Validation error

    def test_register_missing_image_data(self, client, auth_headers):
        """Test registration fails without image_data"""
        response = client.post(
            "/api/face/register",
            json={"person_id": "TEST001"},
            headers=auth_headers
        )

        assert response.status_code == 422  # Validation error

    def test_register_with_small_image(self, client, sample_base64_image, auth_headers):
        """Test registration with too small image (no face detected)"""
        response = client.post(
            "/api/face/register",
            json={
                "person_id": "TEST001",
                "image_data": sample_base64_image
            },
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()

        # Should fail gracefully - no face detected
        assert data["success"] is False
        assert "error" in data
        assert "No face" in data["error"]

    def test_register_response_structure(self, client, sample_base64_image, auth_headers):
        """Test that register response has correct structure"""
        response = client.post(
            "/api/face/register",
            json={
                "person_id": "TEST001",
                "image_data": sample_base64_image
            },
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert "success" in data
        assert isinstance(data["success"], bool)

        # These fields may be null on failure
        assert "person_id" in data
        assert "embedding_dimensions" in data
        assert "face_count" in data
        assert "error" in data


class TestFaceRecognition:
    """Face recognition API tests"""

    def test_recognize_missing_image_data(self, client, auth_headers):
        """Test recognition fails without image_data"""
        response = client.post(
            "/api/face/recognize",
            json={"threshold": 0.6},
            headers=auth_headers
        )

        assert response.status_code == 422  # Validation error

    def test_recognize_with_small_image(self, client, sample_base64_image, auth_headers):
        """Test recognition with too small image (no face detected)"""
        response = client.post(
            "/api/face/recognize",
            json={
                "image_data": sample_base64_image,
                "threshold": 0.6
            },
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()

        # Should return null person_id when no face detected
        assert data["person_id"] is None
        assert "confidence" in data
        assert "distance" in data

    def test_recognize_default_threshold(self, client, sample_base64_image, auth_headers):
        """Test recognition uses default threshold"""
        response = client.post(
            "/api/face/recognize",
            json={"image_data": sample_base64_image},
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()

        # Should succeed with default threshold
        assert "person_id" in data
        assert "confidence" in data
        assert "distance" in data

    def test_recognize_response_structure(self, client, sample_base64_image, auth_headers):
        """Test that recognize response has correct structure"""
        response = client.post(
            "/api/face/recognize",
            json={
                "image_data": sample_base64_image,
                "threshold": 0.6
            },
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert "person_id" in data
        assert "confidence" in data
        assert "distance" in data
        assert "error" in data

        # Check types
        assert isinstance(data["confidence"], (int, float))
        assert isinstance(data["distance"], (int, float))

        # Confidence and distance should be in valid ranges
        assert 0.0 <= data["confidence"] <= 1.0
        assert 0.0 <= data["distance"] <= 1.0

    def test_recognize_custom_threshold(self, client, sample_base64_image, auth_headers):
        """Test recognition with custom threshold"""
        response = client.post(
            "/api/face/recognize",
            json={
                "image_data": sample_base64_image,
                "threshold": 0.8
            },
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()

        # Should accept custom threshold
        assert "person_id" in data
