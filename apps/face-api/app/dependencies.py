"""Dependency injection"""

from app.services.embedding_storage import EmbeddingStorage
from app.services.face_recognition_service import FaceRecognitionService
from app.config import settings

# Singleton instances
_storage: EmbeddingStorage | None = None
_face_service: FaceRecognitionService | None = None


async def get_storage() -> EmbeddingStorage:
    """Get embedding storage instance"""
    global _storage
    if _storage is None:
        _storage = EmbeddingStorage(settings.database_path)
        await _storage.initialize()
    return _storage


async def get_face_service() -> FaceRecognitionService:
    """Get face recognition service instance"""
    global _face_service
    if _face_service is None:
        storage = await get_storage()
        _face_service = FaceRecognitionService(storage)
    return _face_service
