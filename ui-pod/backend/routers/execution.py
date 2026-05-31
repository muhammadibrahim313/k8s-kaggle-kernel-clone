import json
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from db import get_db
from models import SessionORM

router = APIRouter(tags=["execution"])
logger = logging.getLogger(__name__)

WORKER_PORT = 8001


def _worker_url(pod_ip: str) -> str:
    return f"http://{pod_ip}:{WORKER_PORT}"


def _get_active_session(notebook_id: str, db: Session) -> SessionORM:
    session = db.query(SessionORM).filter_by(notebook_id=notebook_id).first()
    if not session or session.status == "stopped" or session.status == "starting":
        raise HTTPException(status_code=409, detail="no_active_session")
    if not session.pod_ip:
        raise HTTPException(status_code=409, detail="no_active_session")
    return session


# ── WebSocket: main execution channel ──────────────────────────────────────

@router.websocket("/ws/notebooks/{notebook_id}/execution")
async def execution_ws(websocket: WebSocket, notebook_id: str):
    await websocket.accept()

    db_gen = get_db()
    db = next(db_gen)

    try:
        session = db.query(SessionORM).filter_by(notebook_id=notebook_id).first()
        if not session or session.status == "stopped" or not session.pod_ip:
            await websocket.send_json({"type": "error", "message": "no_active_session"})
            await websocket.close()
            return

        worker_url = _worker_url(session.pod_ip)

        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                break

            if data.get("type") != "execute":
                continue

            cell_id = data["cell_id"]
            source = data["source"]

            session.status = "busy"
            db.commit()

            try:
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream(
                        "POST",
                        f"{worker_url}/execute",
                        json={"cell_id": cell_id, "source": source},
                    ) as response:
                        async for line in response.aiter_lines():
                            if line:
                                await websocket.send_text(line)
            except Exception as e:
                await websocket.send_json({"type": "error", "cell_id": cell_id, "message": str(e)})

            session.status = "idle"
            db.commit()

    except WebSocketDisconnect:
        pass
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass


# ── REST: interrupt, restart ────────────────────────────────────────────────

@router.post("/api/notebooks/{notebook_id}/interrupt", status_code=204)
async def interrupt(notebook_id: str, db: Session = Depends(get_db)):
    session = _get_active_session(notebook_id, db)
    async with httpx.AsyncClient(timeout=5) as client:
        await client.post(f"{_worker_url(session.pod_ip)}/interrupt")
    session.status = "idle"
    db.commit()


@router.post("/api/notebooks/{notebook_id}/restart", status_code=204)
async def restart_kernel(notebook_id: str, db: Session = Depends(get_db)):
    session = _get_active_session(notebook_id, db)
    async with httpx.AsyncClient(timeout=30) as client:
        await client.post(f"{_worker_url(session.pod_ip)}/restart")
    session.status = "idle"
    db.commit()
