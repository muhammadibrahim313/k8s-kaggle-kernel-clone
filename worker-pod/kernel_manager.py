import json
import logging
from typing import Generator
from jupyter_client import KernelManager as JupyterKernelManager

logger = logging.getLogger(__name__)


class KernelWrapper:
    def __init__(self):
        self._km = JupyterKernelManager()
        self._km.start_kernel()
        self._kc = self._km.client()
        self._kc.start_channels()
        self._kc.wait_for_ready(timeout=30)
        self.execution_count = 0

    def execute(self, cell_id: str, source: str) -> Generator[str, None, None]:
        """Stream output messages as newline-delimited JSON."""
        self._kc.execute(source)
        self.execution_count += 1

        while True:
            try:
                msg = self._kc.get_iopub_msg(timeout=60)
            except Exception:
                break

            msg_type = msg["msg_type"]
            content = msg["content"]

            if msg_type == "stream":
                yield json.dumps({
                    "type": "stream",
                    "cell_id": cell_id,
                    "name": content["name"],
                    "text": content["text"],
                }) + "\n"

            elif msg_type == "execute_result":
                yield json.dumps({
                    "type": "execute_result",
                    "cell_id": cell_id,
                    "execution_count": content["execution_count"],
                    "data": content["data"],
                }) + "\n"

            elif msg_type == "display_data":
                yield json.dumps({
                    "type": "display_data",
                    "cell_id": cell_id,
                    "data": content["data"],
                }) + "\n"

            elif msg_type == "error":
                yield json.dumps({
                    "type": "error",
                    "cell_id": cell_id,
                    "ename": content["ename"],
                    "evalue": content["evalue"],
                    "traceback": content["traceback"],
                }) + "\n"

            elif msg_type == "status":
                state = content["execution_state"]
                if state == "idle":
                    yield json.dumps({
                        "type": "status",
                        "cell_id": cell_id,
                        "execution_state": "idle",
                        "execution_count": self.execution_count,
                    }) + "\n"
                    break

    def interrupt(self):
        self._km.interrupt_kernel()

    def restart(self):
        self._km.restart_kernel(now=True)
        self._kc = self._km.client()
        self._kc.start_channels()
        self._kc.wait_for_ready(timeout=30)
        self.execution_count = 0

    def shutdown(self):
        try:
            self._kc.stop_channels()
            self._km.shutdown_kernel(now=True)
        except Exception:
            pass
