"""Face API Server - Main application"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.routers import health, face
from app.dependencies import get_storage
from app.utils.logger import setup_logging
from app import __version__

# Setup logging
logger = setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info(f"Starting Face API Server v{__version__}")
    logger.info(f"Host: {settings.host}:{settings.port}")
    logger.info(f"Database: {settings.database_path}")
    logger.info(f"Face detection model: {settings.face_detection_model}")
    logger.info(f"Recognition tolerance: {settings.face_recognition_tolerance}")
    
    # Initialize database
    storage = await get_storage()
    count = await storage.count()
    logger.info(f"Registered faces: {count}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Face API Server")


# Create FastAPI app
app = FastAPI(
    title="Face API Server",
    description="Face recognition API for MC-Gate project",
    version=__version__,
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(face.router, tags=["face"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Face API Server",
        "version": __version__,
        "status": "running"
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower()
    )
