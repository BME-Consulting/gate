"""Health check endpoint"""

from fastapi import APIRouter, Depends
from app.models import HealthResponse
from app.services.embedding_storage import EmbeddingStorage
from app.dependencies import get_storage
from app import __version__

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check(
    storage: EmbeddingStorage = Depends(get_storage)
):
    """Health check endpoint"""
    registered_faces = await storage.count()
    
    return HealthResponse(
        status="ok",
        version=__version__,
        registered_faces=registered_faces
    )
