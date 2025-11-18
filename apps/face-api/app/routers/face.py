"""Face recognition endpoints"""

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger

from app.models import (
    FaceRegisterRequest,
    FaceRegisterResponse,
    FaceRecognizeRequest,
    FaceRecognizeResponse
)
from app.services.face_recognition_service import FaceRecognitionService
from app.dependencies import get_face_service
from app.middleware.auth import verify_api_key

router = APIRouter()


@router.post("/api/face/register", response_model=FaceRegisterResponse)
async def register_face(
    request: FaceRegisterRequest,
    face_service: FaceRecognitionService = Depends(get_face_service),
    api_key: str = Depends(verify_api_key)
):
    """
    Register a face with person_id
    
    - **person_id**: Unique identifier for the person
    - **image_data**: Base64 encoded image (data:image/jpeg;base64,...)
    """
    logger.info(f"POST /api/face/register - person_id: {request.person_id}")
    
    success, error, dimensions, face_count = await face_service.register_face(
        request.person_id,
        request.image_data
    )
    
    if success:
        return FaceRegisterResponse(
            success=True,
            person_id=request.person_id,
            embedding_dimensions=dimensions,
            face_count=face_count
        )
    else:
        return FaceRegisterResponse(
            success=False,
            error=error
        )


@router.post("/api/face/recognize", response_model=FaceRecognizeResponse)
async def recognize_face(
    request: FaceRecognizeRequest,
    face_service: FaceRecognitionService = Depends(get_face_service),
    api_key: str = Depends(verify_api_key)
):
    """
    Recognize a face from image
    
    - **image_data**: Base64 encoded image
    - **threshold**: Recognition threshold (0.0-1.0), default 0.6
    """
    logger.info(f"POST /api/face/recognize - threshold: {request.threshold}")
    
    try:
        person_id, confidence, distance = await face_service.recognize_face(
            request.image_data,
            request.threshold
        )
        
        return FaceRecognizeResponse(
            person_id=person_id,
            confidence=confidence,
            distance=distance
        )
    
    except ValueError as e:
        logger.error(f"Recognition failed: {str(e)}")
        return FaceRecognizeResponse(
            person_id=None,
            confidence=0.0,
            distance=1.0,
            error=str(e)
        )
    except Exception as e:
        logger.exception(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
