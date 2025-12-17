"""Image processing utilities"""

import base64
import io
import numpy as np
from PIL import Image, ExifTags
from typing import Tuple


def fix_image_orientation(image: Image.Image) -> Image.Image:
    """
    Fix image orientation based on EXIF data

    Uses PIL's built-in exif_transpose() which correctly handles all EXIF orientations.
    This is more reliable than manual rotation.

    Args:
        image: PIL Image

    Returns:
        Correctly oriented PIL Image
    """
    try:
        from PIL import ImageOps
        # ImageOps.exif_transpose() automatically handles all EXIF orientations
        return ImageOps.exif_transpose(image) or image
    except Exception:
        # Fallback: return original image if exif_transpose fails
        return image


def decode_base64_image(image_data: str) -> np.ndarray:
    """
    Decode base64 image to numpy array

    Args:
        image_data: Base64 encoded image (data:image/jpeg;base64,...)

    Returns:
        numpy array in RGB format

    Raises:
        ValueError: If image data is invalid
    """
    try:
        # Remove data URI prefix if present
        if image_data.startswith('data:image'):
            image_data = image_data.split(',', 1)[1]

        # Decode base64
        image_bytes = base64.b64decode(image_data)

        # Open with PIL
        image = Image.open(io.BytesIO(image_bytes))

        # Fix EXIF orientation (front camera rotation fix)
        image = fix_image_orientation(image)

        # Convert to RGB
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Convert to numpy array
        return np.array(image)

    except Exception as e:
        raise ValueError(f"Failed to decode image: {str(e)}")


def validate_image_size(image_bytes: bytes, max_size_mb: int) -> None:
    """
    Validate image size
    
    Args:
        image_bytes: Image bytes
        max_size_mb: Maximum size in MB
    
    Raises:
        ValueError: If image is too large
    """
    size_mb = len(image_bytes) / (1024 * 1024)
    if size_mb > max_size_mb:
        raise ValueError(f"Image too large: {size_mb:.2f}MB (max: {max_size_mb}MB)")
