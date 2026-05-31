import asyncio
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from db import get_db
from models import NotebookORM, SessionORM, SessionOut
from orchestrator import orchestrator

router = APIRouter(prefix="/api/notebooks", tags=["sessions"])
logger = logging.getLogger(__name__)


async def _wait_and_mark_idle(notebook_id: str, pod_name: str):
    ready = await orchestrator.wait_for_pod_ready(pod_name)
    db_gen = get_db()
    db = next(db_gen)
    try:
        session = db.query(SessionORM).filter_by(notebook_id=notebook_id).first()
        if session:
            if ready:
                ip = orchestrator.get_pod_ip(pod_name)
                session.pod_ip = ip
                session.status = "idle"
            else:
                orchestrator.kill_pod(pod_name)
                db.delete(session)
            db.commit()
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass


@router.post("/{notebook_id}/session", response_model=SessionOut, status_code=201)
async def start_session(
    notebook_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    nb = db.query(NotebookORM).filter_by(id=notebook_id).first()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")

    existing = db.query(SessionORM).filter_by(notebook_id=notebook_id).first()
    if existing and existing.status != "stopped":
        raise HTTPException(status_code=409, detail="Session already active")

    if existing:
        db.delete(existing)
        db.commit()

    pod_name = orchestrator.spawn_pod(notebook_id)
    now = datetime.utcnow()
    session = SessionORM(
        notebook_id=notebook_id,
        pod_name=pod_name,
        pod_ip=None,
        status="starting",
        started_at=now,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    background_tasks.add_task(_wait_and_mark_idle, notebook_id, pod_name)

    return SessionOut(
        notebook_id=session.notebook_id,
        pod_name=session.pod_name,
        status=session.status,
        started_at=session.started_at,
    )


@router.delete("/{notebook_id}/session", status_code=204)
def stop_session(notebook_id: str, db: Session = Depends(get_db)):
    session = db.query(SessionORM).filter_by(notebook_id=notebook_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="No active session")

    orchestrator.kill_pod(session.pod_name)
    db.delete(session)
    db.commit()


@router.get("/{notebook_id}/session", response_model=SessionOut)
def get_session(notebook_id: str, db: Session = Depends(get_db)):
    session = db.query(SessionORM).filter_by(notebook_id=notebook_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="No active session")
    return SessionOut(
        notebook_id=session.notebook_id,
        pod_name=session.pod_name,
        status=session.status,
        started_at=session.started_at,
    )
