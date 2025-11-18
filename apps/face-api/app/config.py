"""Configuration management"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings"""
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8100
    
    # Security
    api_key: str = "development-api-key-12345"
    cors_origins: str = "http://localhost:3000,http://192.168.1.4:8081"
    
    # Database
    database_path: str = "./data/embeddings.db"
    
    # Face recognition
    face_detection_model: str = "hog"  # hog or cnn
    face_recognition_tolerance: float = 0.6
    max_image_size_mb: int = 10
    
    # Logging
    log_level: str = "INFO"
    
    class Config:
        env_file = ".env"
        case_sensitive = False
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins as list"""
        return [origin.strip() for origin in self.cors_origins.split(",")]


settings = Settings()
