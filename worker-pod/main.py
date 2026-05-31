"""Worker pod — HTTP API wrapping a persistent ipykernel process."""
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager

from kernel_manager import KernelWrapper

logger = logging.getLogger(__name__)
kernel: KernelWrapper | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global kernel
    kernel = KernelWrapper()
    logger.info("Kernel started")
    yield
    if kernel:
        kernel.shutdown()
    logger.info("Kernel shut down")


app = FastAPI(title="Kaggle Kernel Worker", lifespan=lifespan)


class ExecuteRequest(BaseModel):
    cell_id: str
    source: str


@app.get("/status")
def status():
    return {"status": "idle" if kernel else "stopped"}


@app.post("/execute")
def execute(req: ExecuteRequest):
    if not kernel:
        raise HTTPException(status_code=503, detail="Kernel not ready")

    def stream():
        yield from kernel.execute(req.cell_id, req.source)

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.post("/interrupt", status_code=204)
def interrupt():
    if not kernel:
        raise HTTPException(status_code=503, detail="Kernel not ready")
    kernel.interrupt()


@app.post("/restart", status_code=204)
def restart():
    if not kernel:
        raise HTTPException(status_code=503, detail="Kernel not ready")
    kernel.restart()
