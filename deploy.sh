#!/bin/bash
# One-command Minikube deploy. Usage: ./deploy.sh [--build]
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
NAMESPACE="kaggle-kernel"
RELEASE="kaggle-kernel"
CHART="./helm/kaggle-kernel"
UI_IMAGE="kernel-ui:latest"
WORKER_IMAGE="kernel-worker:latest"
LOCAL_PORT=8080

# ── Flags ─────────────────────────────────────────────────────────────────────
BUILD=false
for arg in "$@"; do
  case $arg in
    --build) BUILD=true ;;
    *) echo "Unknown argument: $arg"; echo "Usage: ./deploy.sh [--build]"; exit 1 ;;
  esac
done

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}WARN${NC} $*"; }
die()  { echo -e "${RED}ERROR${NC} $*"; exit 1; }

cd "$(dirname "$0")"

# ── Prereq checks ─────────────────────────────────────────────────────────────
for cmd in minikube helm kubectl docker; do
  command -v "$cmd" &>/dev/null || die "'$cmd' not found — please install it first."
done

# ── Start minikube if needed ──────────────────────────────────────────────────
if ! minikube status 2>/dev/null | grep -q "Running"; then
  log "Starting minikube..."
  minikube start
fi

# ── Enable ingress addon ───────────────────────────────────────────────────────
if ! minikube addons list | grep -q "ingress.*enabled"; then
  log "Enabling ingress addon..."
  minikube addons enable ingress
fi

# ── Wait for ingress webhook to be ready (avoids 'connection refused' on install)
log "Waiting for ingress-nginx webhook to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s 2>/dev/null || warn "Ingress controller not ready — continuing anyway"

# ── Point Docker to minikube's daemon ────────────────────────────────────────
log "Pointing Docker to minikube's daemon..."
eval "$(minikube docker-env)"

# ── Build images (only if --build passed) ─────────────────────────────────────
if [ "$BUILD" = true ]; then
  log "Building UI image ($UI_IMAGE)..."
  docker build -t "$UI_IMAGE" ./ui-pod

  log "Building Worker image ($WORKER_IMAGE)..."
  docker build -t "$WORKER_IMAGE" ./worker-pod
else
  log "Skipping image build (pass --build to rebuild)"
fi

# ── Namespace ─────────────────────────────────────────────────────────────────
log "Creating namespace '$NAMESPACE' (idempotent)..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# ── Clean uninstall of existing release ───────────────────────────────────────
# Kill stale port-forwards first (they break when pods are recreated)
pkill -f "kubectl port-forward.*$LOCAL_PORT" 2>/dev/null || true

if helm status "$RELEASE" -n "$NAMESPACE" &>/dev/null; then
  log "Removing existing Helm release '$RELEASE'..."
  helm uninstall "$RELEASE" -n "$NAMESPACE"
  log "Waiting for old pods to terminate..."
  kubectl wait --for=delete pods -l app=kaggle-kernel-ui -n "$NAMESPACE" --timeout=90s 2>/dev/null || true
fi

# Worker pods are spawned outside Helm — must delete before PVC can release
if kubectl get pods -n "$NAMESPACE" -l app=kaggle-kernel-worker --no-headers 2>/dev/null | grep -q .; then
  log "Removing orphaned worker pods..."
  kubectl delete pods -n "$NAMESPACE" -l app=kaggle-kernel-worker --timeout=60s 2>/dev/null || true
  kubectl wait --for=delete pods -l app=kaggle-kernel-worker -n "$NAMESPACE" --timeout=90s 2>/dev/null || true
fi

# Delete any leftover UI pods from failed partial installs
kubectl delete pods -n "$NAMESPACE" -l app=kaggle-kernel-ui --ignore-not-found --timeout=60s 2>/dev/null || true

# Delete stale PVCs for a fresh data volume
if kubectl get pvc -n "$NAMESPACE" 2>/dev/null | grep -q "kaggle"; then
  log "Deleting stale PVCs..."
  kubectl delete pvc --all -n "$NAMESPACE" --timeout=30s 2>/dev/null || true
  log "Waiting for PVC deletion to finish..."
  for _ in $(seq 1 60); do
    if ! kubectl get pvc -n "$NAMESPACE" 2>/dev/null | grep -q "kaggle"; then
      break
    fi
    sleep 2
  done
  if kubectl get pvc -n "$NAMESPACE" 2>/dev/null | grep -q "kaggle"; then
    warn "PVC still terminating — force-removing finalizers..."
    kubectl patch pvc kaggle-kernel-pvc -n "$NAMESPACE" -p '{"metadata":{"finalizers":null}}' --type=merge 2>/dev/null || true
    sleep 3
  fi
fi

# ── Helm install ──────────────────────────────────────────────────────────────
log "Installing Helm chart..."
helm upgrade --install "$RELEASE" "$CHART" \
  --namespace "$NAMESPACE" \
  --set storage.accessMode=ReadWriteOnce \
  --set storage.storageClass=standard \
  --set uiPod.imagePullPolicy=Never \
  --set workerPod.imagePullPolicy=Never \
  --set namespace="$NAMESPACE" \
  --wait --timeout=180s

# ── Wait for deployment ───────────────────────────────────────────────────────
log "Waiting for UI deployment to be ready..."
kubectl rollout status deployment/kaggle-kernel-ui -n "$NAMESPACE" --timeout=120s

# ── Port-forward ──────────────────────────────────────────────────────────────
sleep 1

log "Starting port-forward on localhost:$LOCAL_PORT ..."
kubectl port-forward svc/kaggle-kernel-ui "$LOCAL_PORT":80 -n "$NAMESPACE" &
PF_PID=$!
sleep 2

if kill -0 "$PF_PID" 2>/dev/null; then
  echo ""
  echo -e "${GREEN}─────────────────────────────────────────────${NC}"
  echo -e "${GREEN}  App is running at http://localhost:$LOCAL_PORT ${NC}"
  echo -e "${GREEN}─────────────────────────────────────────────${NC}"
  echo ""
  echo "  Port-forward PID : $PF_PID"
  echo "  Stop port-forward: kill $PF_PID"
  echo "  Watch pods       : kubectl get pods -n $NAMESPACE -w"
  echo ""
else
  warn "Port-forward failed. Run manually:"
  echo "  kubectl port-forward svc/kaggle-kernel-ui $LOCAL_PORT:80 -n $NAMESPACE"
fi
