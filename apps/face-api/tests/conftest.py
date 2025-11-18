"""pytest configuration and fixtures"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings


@pytest.fixture
def client():
    """Test client fixture"""
    return TestClient(app)


@pytest.fixture
def api_key():
    """API key fixture"""
    return settings.api_key


@pytest.fixture
def auth_headers(api_key):
    """Authorization headers fixture"""
    return {"x-api-key": api_key}


@pytest.fixture
def sample_base64_image():
    """Sample base64 image (1x1 red pixel PNG)"""
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
