"""Pydantic models for request/response"""

from pydantic import BaseModel, Field
from typing import Optional


class FaceRegisterRequest(BaseModel):
    """Face registration request"""
    person_id: str = Field(..., description="Unique person identifier")
    image_data: str = Field(..., description="Base64 encoded image (data:image/jpeg;base64,...)")


class FaceRegisterResponse(BaseModel):
    """Face registration response"""
    success: bool
    person_id: Optional[str] = None
    embedding_dimensions: Optional[int] = None
    face_count: Optional[int] = None
    error: Optional[str] = None


class FaceRecognizeRequest(BaseModel):
    """Face recognition request"""
    image_data: str = Field(..., description="Base64 encoded image")
    threshold: float = Field(0.6, description="Recognition threshold (0.0-1.0)")


class FaceRecognizeResponse(BaseModel):
    """Face recognition response"""
    person_id: Optional[str] = None
    confidence: float
    distance: float
    error: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    version: str
    registered_faces: int
