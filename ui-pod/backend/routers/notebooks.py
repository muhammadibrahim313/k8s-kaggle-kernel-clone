import os
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import nbformat

from db import get_db
from models import NotebookORM, SessionORM, NotebookCreate, NotebookMeta

router = APIRouter(prefix="/api/notebooks", tags=["notebooks"])

DATA_PATH = os.getenv("DATA_PATH", "/data")
NOTEBOOKS_DIR = os.path.join(DATA_PATH, "notebooks")


def _notebook_path(notebook_id: str) -> str:
    return os.path.join(NOTEBOOKS_DIR, f"{notebook_id}.ipynb")


def _empty_notebook() -> dict:
    nb = nbformat.v4.new_notebook()
    nb.cells = [nbformat.v4.new_code_cell("")]
    return nbformat.writes(nb)


def _files_dir(notebook_id: str) -> str:
    return os.path.join(DATA_PATH, "files", notebook_id)


def _ensure_dirs(notebook_id: str | None = None):
    os.makedirs(NOTEBOOKS_DIR, exist_ok=True)
    if notebook_id:
        os.makedirs(_files_dir(notebook_id), exist_ok=True)


@router.get("", response_model=list[NotebookMeta])
def list_notebooks(db: Session = Depends(get_db)):
    notebooks = db.query(NotebookORM).order_by(NotebookORM.created_at.desc()).all()
    result = []
    for nb in notebooks:
        session = db.query(SessionORM).filter_by(notebook_id=nb.id).first()
        meta = NotebookMeta(
            id=nb.id,
            name=nb.name,
            created_at=nb.created_at,
            updated_at=nb.updated_at,
            session_status=session.status if session else None,
        )
        result.append(meta)
    return result


@router.post("", response_model=NotebookMeta, status_code=201)
def create_notebook(body: NotebookCreate, db: Session = Depends(get_db)):
    _ensure_dirs()
    notebook_id = str(uuid.uuid4())
    now = datetime.utcnow()
    orm = NotebookORM(id=notebook_id, name=body.name, created_at=now, updated_at=now)
    db.add(orm)
    db.commit()
    db.refresh(orm)

    with open(_notebook_path(notebook_id), "w") as f:
        f.write(_empty_notebook())

    return NotebookMeta(
        id=orm.id,
        name=orm.name,
        created_at=orm.created_at,
        updated_at=orm.updated_at,
        session_status=None,
    )


def _normalize_notebook(nb: dict) -> dict:
    """Jupyter stores source/text as list[str] — join to plain string for the frontend."""
    for cell in nb.get("cells", []):
        if isinstance(cell.get("source"), list):
            cell["source"] = "".join(cell["source"])
        for output in cell.get("outputs", []):
            if isinstance(output.get("text"), list):
                output["text"] = "".join(output["text"])
    return nb


@router.get("/{notebook_id}")
def get_notebook(notebook_id: str, db: Session = Depends(get_db)):
    orm = db.query(NotebookORM).filter_by(id=notebook_id).first()
    if not orm:
        raise HTTPException(status_code=404, detail="Notebook not found")

    path = _notebook_path(notebook_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Notebook file missing")

    with open(path) as f:
        nb_content = _normalize_notebook(json.load(f))

    session = db.query(SessionORM).filter_by(notebook_id=notebook_id).first()
    return {
        "id": orm.id,
        "name": orm.name,
        "created_at": orm.created_at,
        "updated_at": orm.updated_at,
        "session_status": session.status if session else None,
        "notebook": nb_content,
    }


@router.put("/{notebook_id}", status_code=204)
def save_notebook(notebook_id: str, body: dict, db: Session = Depends(get_db)):
    orm = db.query(NotebookORM).filter_by(id=notebook_id).first()
    if not orm:
        raise HTTPException(status_code=404, detail="Notebook not found")

    _ensure_dirs()
    with open(_notebook_path(notebook_id), "w") as f:
        json.dump(body, f, indent=2)

    orm.updated_at = datetime.utcnow()
    db.commit()


@router.get("/{notebook_id}/files")
def list_files(notebook_id: str, db: Session = Depends(get_db)):
    orm = db.query(NotebookORM).filter_by(id=notebook_id).first()
    if not orm:
        raise HTTPException(status_code=404, detail="Notebook not found")

    dir_path = _files_dir(notebook_id)
    if not os.path.isdir(dir_path):
        return {"files": []}

    files = []
    for name in sorted(os.listdir(dir_path)):
        full = os.path.join(dir_path, name)
        if os.path.isfile(full):
            files.append({
                "name": name,
                "path": full,
                "size": os.path.getsize(full),
            })
    return {"files": files}


@router.post("/{notebook_id}/upload", status_code=201)
async def upload_file(
    notebook_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    orm = db.query(NotebookORM).filter_by(id=notebook_id).first()
    if not orm:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if not file.filename or file.filename.startswith(".") or ".." in file.filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    _ensure_dirs(notebook_id)
    dest = os.path.join(_files_dir(notebook_id), os.path.basename(file.filename))
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)

    return {
        "name": os.path.basename(file.filename),
        "path": dest,
        "size": len(content),
    }


@router.delete("/{notebook_id}", status_code=204)
def delete_notebook(notebook_id: str, db: Session = Depends(get_db)):
    from orchestrator import orchestrator

    orm = db.query(NotebookORM).filter_by(id=notebook_id).first()
    if not orm:
        raise HTTPException(status_code=404, detail="Notebook not found")

    session = db.query(SessionORM).filter_by(notebook_id=notebook_id).first()
    if session:
        orchestrator.kill_pod(session.pod_name)
        db.delete(session)

    path = _notebook_path(notebook_id)
    if os.path.exists(path):
        os.remove(path)

    db.delete(orm)
    db.commit()
