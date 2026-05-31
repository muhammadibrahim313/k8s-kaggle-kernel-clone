"""Spawns and manages worker pods via the Kubernetes API."""
import os
import asyncio
import logging
from kubernetes import client, config
from kubernetes.client.rest import ApiException

logger = logging.getLogger(__name__)

NAMESPACE = os.getenv("K8S_NAMESPACE", "default")
WORKER_IMAGE = os.getenv("WORKER_IMAGE", "kaggle-kernel/worker:latest")
PVC_NAME = os.getenv("PVC_NAME", "kaggle-kernel-pvc")
WORKER_PORT = int(os.getenv("WORKER_PORT", "8001"))


def _load_k8s():
    try:
        config.load_incluster_config()
    except config.ConfigException:
        config.load_kube_config()


def _build_pod_manifest(notebook_id: str, pod_name: str) -> client.V1Pod:
    return client.V1Pod(
        metadata=client.V1ObjectMeta(
            name=pod_name,
            namespace=NAMESPACE,
            labels={"app": "kaggle-kernel-worker", "notebook-id": notebook_id},
        ),
        spec=client.V1PodSpec(
            restart_policy="Never",
            containers=[
                client.V1Container(
                    name="worker",
                    image=WORKER_IMAGE,
                    image_pull_policy="IfNotPresent",
                    ports=[client.V1ContainerPort(container_port=WORKER_PORT)],
                    env=[
                        client.V1EnvVar(name="NOTEBOOK_ID", value=notebook_id),
                        client.V1EnvVar(name="DATA_PATH", value="/data"),
                    ],
                    volume_mounts=[
                        client.V1VolumeMount(name="data", mount_path="/data")
                    ],
                    resources=client.V1ResourceRequirements(
                        requests={"cpu": "500m", "memory": "512Mi"},
                        limits={"cpu": "2", "memory": "2Gi"},
                    ),
                )
            ],
            volumes=[
                client.V1Volume(
                    name="data",
                    persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                        claim_name=PVC_NAME
                    ),
                )
            ],
        ),
    )


class Orchestrator:
    def __init__(self):
        _load_k8s()
        self.v1 = client.CoreV1Api()

    def spawn_pod(self, notebook_id: str) -> str:
        pod_name = f"worker-{notebook_id[:12]}"
        manifest = _build_pod_manifest(notebook_id, pod_name)
        try:
            self.v1.create_namespaced_pod(namespace=NAMESPACE, body=manifest)
        except ApiException as e:
            if e.status == 409:
                # Pod already exists — reuse it
                pass
            else:
                raise
        return pod_name

    def kill_pod(self, pod_name: str):
        try:
            self.v1.delete_namespaced_pod(name=pod_name, namespace=NAMESPACE)
        except ApiException as e:
            if e.status != 404:
                logger.warning("Failed to delete pod %s: %s", pod_name, e)

    def get_pod_ip(self, pod_name: str) -> str | None:
        try:
            pod = self.v1.read_namespaced_pod(name=pod_name, namespace=NAMESPACE)
            return pod.status.pod_ip
        except ApiException:
            return None

    async def wait_for_pod_ready(self, pod_name: str, timeout: int = 120) -> bool:
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            try:
                pod = self.v1.read_namespaced_pod(name=pod_name, namespace=NAMESPACE)
                if pod.status.phase == "Running" and pod.status.pod_ip:
                    return True
            except ApiException:
                pass
            await asyncio.sleep(2)
        return False


orchestrator = Orchestrator()
