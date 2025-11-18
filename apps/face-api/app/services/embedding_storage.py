"""Face embedding storage using SQLite"""

import aiosqlite
import numpy as np
import pickle
from datetime import datetime
from typing import List, Optional, Dict
from pathlib import Path
from loguru import logger


class EmbeddingStorage:
    """SQLite-based face embedding storage"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._ensure_directory()
    
    def _ensure_directory(self):
        """Ensure database directory exists"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
    
    async def initialize(self):
        """Initialize database schema"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS face_embeddings (
                    person_id TEXT PRIMARY KEY,
                    embedding BLOB NOT NULL,
                    embedding_dimensions INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_person_id 
                ON face_embeddings(person_id)
            """)
            await db.commit()
        
        logger.info(f"Database initialized: {self.db_path}")
    
    async def save_embedding(
        self, 
        person_id: str, 
        embedding: np.ndarray
    ) -> None:
        """
        Save face embedding
        
        Args:
            person_id: Unique person identifier
            embedding: Face embedding vector (128-dim)
        """
        # Serialize embedding to bytes
        embedding_bytes = pickle.dumps(embedding)
        now = datetime.utcnow().isoformat()
        
        async with aiosqlite.connect(self.db_path) as db:
            # Check if exists
            cursor = await db.execute(
                "SELECT person_id FROM face_embeddings WHERE person_id = ?",
                (person_id,)
            )
            exists = await cursor.fetchone()
            
            if exists:
                # Update existing
                await db.execute("""
                    UPDATE face_embeddings 
                    SET embedding = ?, 
                        embedding_dimensions = ?,
                        updated_at = ?
                    WHERE person_id = ?
                """, (embedding_bytes, len(embedding), now, person_id))
                logger.info(f"Updated embedding for person_id: {person_id}")
            else:
                # Insert new
                await db.execute("""
                    INSERT INTO face_embeddings 
                    (person_id, embedding, embedding_dimensions, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (person_id, embedding_bytes, len(embedding), now, now))
                logger.info(f"Saved new embedding for person_id: {person_id}")
            
            await db.commit()
    
    async def get_embedding(self, person_id: str) -> Optional[np.ndarray]:
        """
        Get face embedding by person_id
        
        Args:
            person_id: Person identifier
        
        Returns:
            Face embedding or None if not found
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT embedding FROM face_embeddings WHERE person_id = ?",
                (person_id,)
            )
            row = await cursor.fetchone()
            
            if row:
                return pickle.loads(row[0])
            return None
    
    async def get_all_embeddings(self) -> Dict[str, np.ndarray]:
        """
        Get all face embeddings
        
        Returns:
            Dictionary of {person_id: embedding}
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT person_id, embedding FROM face_embeddings"
            )
            rows = await cursor.fetchall()
            
            return {
                row[0]: pickle.loads(row[1])
                for row in rows
            }
    
    async def delete_embedding(self, person_id: str) -> bool:
        """
        Delete face embedding
        
        Args:
            person_id: Person identifier
        
        Returns:
            True if deleted, False if not found
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "DELETE FROM face_embeddings WHERE person_id = ?",
                (person_id,)
            )
            await db.commit()
            
            deleted = cursor.rowcount > 0
            if deleted:
                logger.info(f"Deleted embedding for person_id: {person_id}")
            return deleted
    
    async def count(self) -> int:
        """Get total number of registered faces"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT COUNT(*) FROM face_embeddings"
            )
            row = await cursor.fetchone()
            return row[0] if row else 0
