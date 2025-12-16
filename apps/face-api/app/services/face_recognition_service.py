"""Face recognition service using face_recognition library"""

import face_recognition
import numpy as np
from typing import Tuple, Optional, List
from loguru import logger

from app.config import settings
from app.services.embedding_storage import EmbeddingStorage
from app.utils.image import decode_base64_image


class FaceRecognitionService:
    """Face recognition service"""
    
    def __init__(self, storage: EmbeddingStorage):
        self.storage = storage
        self.model = settings.face_detection_model
        self.tolerance = settings.face_recognition_tolerance
    
    def detect_faces(self, image: np.ndarray) -> List[Tuple]:
        """
        Detect faces in image
        
        Args:
            image: numpy array (RGB)
        
        Returns:
            List of face locations [(top, right, bottom, left), ...]
        """
        return face_recognition.face_locations(
            image, 
            model=self.model
        )
    
    def extract_embedding(
        self, 
        image: np.ndarray, 
        face_location: Optional[Tuple] = None
    ) -> Optional[np.ndarray]:
        """
        Extract face embedding
        
        Args:
            image: numpy array (RGB)
            face_location: Optional specific face location
        
        Returns:
            128-dimensional embedding or None
        """
        if face_location:
            encodings = face_recognition.face_encodings(
                image, 
                known_face_locations=[face_location]
            )
        else:
            encodings = face_recognition.face_encodings(image)
        
        if len(encodings) == 0:
            return None
        
        return encodings[0]
    
    async def register_face(
        self,
        person_id: str,
        image_data: str
    ) -> Tuple[bool, Optional[str], Optional[int], Optional[int]]:
        """
        Register face from image

        Args:
            person_id: Unique person identifier
            image_data: Base64 encoded image

        Returns:
            (success, error_message, embedding_dimensions, face_count)
        """
        try:
            # Decode image
            logger.info(f"Registering face for person_id: {person_id}")
            image = decode_base64_image(image_data)

            # DEBUG: Save image to check orientation
            from PIL import Image as PILImage
            import os
            debug_dir = "/tmp/face_debug"
            os.makedirs(debug_dir, exist_ok=True)
            debug_path = f"{debug_dir}/{person_id}_debug.jpg"
            PILImage.fromarray(image).save(debug_path)
            logger.info(f"DEBUG: Saved image to {debug_path} (shape: {image.shape})")

            # Detect faces
            face_locations = self.detect_faces(image)
            face_count = len(face_locations)

            logger.info(f"Detected {face_count} face(s)")
            
            if face_count == 0:
                return False, "No face detected in the image", None, 0
            
            # Use largest face if multiple detected
            if face_count > 1:
                logger.warning(f"Multiple faces detected ({face_count}), using largest")
                # Calculate face areas and select largest
                face_areas = [
                    (bottom - top) * (right - left)
                    for top, right, bottom, left in face_locations
                ]
                largest_idx = max(range(len(face_areas)), key=lambda i: face_areas[i])
                face_location = face_locations[largest_idx]
            else:
                face_location = face_locations[0]
            
            # Extract embedding
            embedding = self.extract_embedding(image, face_location)
            
            if embedding is None:
                return False, "Failed to extract face embedding", None, face_count
            
            # Save to database
            await self.storage.save_embedding(person_id, embedding)
            
            logger.info(
                f"Successfully registered face for person_id: {person_id}, "
                f"embedding_dimensions: {len(embedding)}"
            )
            
            return True, None, len(embedding), face_count
            
        except ValueError as e:
            logger.error(f"Registration failed: {str(e)}")
            return False, str(e), None, None
        except Exception as e:
            logger.exception(f"Unexpected error during registration: {str(e)}")
            return False, f"Internal error: {str(e)}", None, None
    
    async def recognize_face(
        self, 
        image_data: str, 
        threshold: Optional[float] = None
    ) -> Tuple[Optional[str], float, float]:
        """
        Recognize face from image
        
        Args:
            image_data: Base64 encoded image
            threshold: Recognition threshold (default from config)
        
        Returns:
            (person_id, confidence, distance)
            person_id is None if no match found
        """
        try:
            if threshold is None:
                threshold = self.tolerance
            
            # Decode image
            logger.info("Recognizing face from image")
            image = decode_base64_image(image_data)
            
            # Detect faces
            face_locations = self.detect_faces(image)
            
            if len(face_locations) == 0:
                logger.info("No face detected")
                return None, 0.0, 1.0
            
            # Use largest face if multiple
            if len(face_locations) > 1:
                logger.warning(f"Multiple faces detected ({len(face_locations)}), using largest")
                face_areas = [
                    (bottom - top) * (right - left)
                    for top, right, bottom, left in face_locations
                ]
                largest_idx = max(range(len(face_areas)), key=lambda i: face_areas[i])
                face_location = face_locations[largest_idx]
            else:
                face_location = face_locations[0]
            
            # Extract embedding
            embedding = self.extract_embedding(image, face_location)
            
            if embedding is None:
                logger.error("Failed to extract embedding")
                return None, 0.0, 1.0
            
            # Get all registered embeddings
            registered_embeddings = await self.storage.get_all_embeddings()
            
            if len(registered_embeddings) == 0:
                logger.warning("No registered faces in database")
                return None, 0.0, 1.0
            
            logger.info(f"Comparing against {len(registered_embeddings)} registered faces")
            
            # Compare with all registered faces
            best_match_id = None
            best_distance = 1.0
            
            for person_id, known_embedding in registered_embeddings.items():
                # Calculate face distance (lower is better)
                distance = face_recognition.face_distance(
                    [known_embedding], 
                    embedding
                )[0]
                
                logger.debug(f"person_id: {person_id}, distance: {distance:.4f}")
                
                if distance < best_distance:
                    best_distance = distance
                    best_match_id = person_id
            
            # Check if match is good enough
            if best_distance <= threshold:
                confidence = 1.0 - best_distance  # Convert to confidence
                logger.info(
                    f"Match found: person_id: {best_match_id}, "
                    f"confidence: {confidence:.4f}, distance: {best_distance:.4f}"
                )
                return best_match_id, confidence, best_distance
            else:
                logger.info(
                    f"No match found (best distance: {best_distance:.4f} > threshold: {threshold})"
                )
                return None, 1.0 - best_distance, best_distance
            
        except ValueError as e:
            logger.error(f"Recognition failed: {str(e)}")
            raise
        except Exception as e:
            logger.exception(f"Unexpected error during recognition: {str(e)}")
            raise
