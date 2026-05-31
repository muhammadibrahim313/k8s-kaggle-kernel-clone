from datetime import datetime
from typing import Optional
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from pydantic import BaseModel
from db import Base


class NotebookORM(Base):
    __tablename__ = "notebooks"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class SessionORM(Base):
    __tablename__ = "sessions"

    notebook_id = Column(String, ForeignKey("notebooks.id", ondelete="CASCADE"), primary_key=True)
    pod_name = Column(String, nullable=False)
    pod_ip = Column(String, nullable=True)
    status = Column(String, nullable=False)  # starting | idle | busy | stopped
    started_at = Column(DateTime, default=func.now())


# ---------- Pydantic schemas ----------

class NotebookCreate(BaseModel):
    name: str


class NotebookMeta(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    session_status: Optional[str] = None

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    notebook_id: str
    pod_name: str
    status: str
    started_at: datetime

    model_config = {"from_attributes": True}
