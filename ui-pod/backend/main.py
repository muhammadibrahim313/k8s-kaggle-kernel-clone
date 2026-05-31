"""UI pod entrypoint — FastAPI REST + WebSocket, serves React SPA."""
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from db import init_db
from routers import notebooks, sessions, execution

app = FastAPI(title="K8s Kaggle Kernel Clone")

app.include_router(notebooks.router)
app.include_router(sessions.router)
app.include_router(execution.router)

STATIC_DIR = os.getenv("STATIC_DIR", "/app/static")


@app.on_event("startup")
def on_startup():
    os.makedirs("/data/notebooks", exist_ok=True)
    os.makedirs("/data/files", exist_ok=True)
    init_db()


if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
