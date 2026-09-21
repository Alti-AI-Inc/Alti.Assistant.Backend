#!/bin/bash
# Alti AI — Deploy to Liberty Center One
# Usage: ./deploy.sh [build|start|stop|restart|logs|status]

set -euo pipefail

APP_NAME="alti-backend"
COMPOSE_FILE="docker-compose.yml"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
err() { echo -e "${RED}[deploy]${NC} $1" >&2; }

# Check .env exists
check_env() {
  if [ ! -f .env ]; then
    err ".env file not found. Copy .env.example and fill in values."
    exit 1
  fi
}

case "${1:-help}" in
  build)
    log "Building $APP_NAME..."
    check_env
    docker compose -f "$COMPOSE_FILE" build --no-cache backend
    log "Build complete."
    ;;

  start)
    log "Starting $APP_NAME..."
    check_env
    docker compose -f "$COMPOSE_FILE" up -d
    log "Waiting for health checks..."
    sleep 5
    docker compose -f "$COMPOSE_FILE" ps
    log "Started. Run './deploy.sh logs' to follow output."
    ;;

  stop)
    log "Stopping $APP_NAME..."
    docker compose -f "$COMPOSE_FILE" down
    log "Stopped."
    ;;

  restart)
    log "Restarting $APP_NAME..."
    check_env
    docker compose -f "$COMPOSE_FILE" down
    docker compose -f "$COMPOSE_FILE" up -d --build backend
    log "Restarted."
    ;;

  update)
    log "Zero-downtime update..."
    check_env
    # Build new image
    docker compose -f "$COMPOSE_FILE" build backend
    # Recreate backend only (Redis + MongoDB stay up)
    docker compose -f "$COMPOSE_FILE" up -d --no-deps backend
    log "Updated. Health check will verify."
    ;;

  logs)
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100 "${2:-backend}"
    ;;

  status)
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    log "Health checks:"
    curl -sf http://localhost:${PORT:-5100}/health | python3 -m json.tool 2>/dev/null || warn "Backend not responding"
    ;;

  test)
    log "Running tests..."
    npx vitest run
    ;;

  *)
    echo "Alti AI Deploy Script"
    echo ""
    echo "Usage: ./deploy.sh <command>"
    echo ""
    echo "Commands:"
    echo "  build     Build Docker image"
    echo "  start     Start all services (Redis + MongoDB + Backend)"
    echo "  stop      Stop all services"
    echo "  restart   Rebuild and restart backend"
    echo "  update    Zero-downtime backend update (keeps DB/Redis)"
    echo "  logs      Follow backend logs (or: logs redis, logs mongodb)"
    echo "  status    Show service status + health check"
    echo "  test      Run test suite"
    ;;
esac
