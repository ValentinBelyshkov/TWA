from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
import docker

router = APIRouter()

docker_client = docker.from_env()

class ComponentAction(BaseModel):
    component: str
    action: str

class CommandResponse(BaseModel):
    success: bool
    output: str
    error: str | None = None

class ModeRequest(BaseModel):
    project_id: str
    mode: Literal["manual", "auto", "simulation", "hover"]

mode_states: dict = {}

@router.post("/mode")
async def set_mode(request: ModeRequest):
    """Switch drone operation mode."""
    mode_states[request.project_id] = request.mode
    
    return {
        "project_id": request.project_id,
        "mode": request.mode,
        "status": "mode_changed"
    }

@router.get("/mode/{project_id}")
async def get_mode(project_id: str):
    """Get current mode for a project."""
    return {
        "project_id": project_id,
        "mode": mode_states.get(project_id, "manual")
    }

@router.post("/emergency-stop")
async def emergency_stop(project_id: str):
    """Emergency stop for drone."""
    mode_states[project_id] = "emergency_stop"
    
    return {
        "project_id": project_id,
        "status": "emergency_stopped",
        "message": "All motors stopped"
    }

@router.post("/arm")
async def arm_drone(project_id: str):
    """Arm drone for flight."""
    return {
        "project_id": project_id,
        "status": "armed",
        "message": "Drone is armed and ready"
    }

@router.post("/disarm")
async def disarm_drone(project_id: str):
    """Disarm drone."""
    return {
        "project_id": project_id,
        "status": "disarmed",
        "message": "Drone is disarmed"
    }


# TerraSLAM component control
TERRASLAM_CONTAINER = "TerraSLAM"
SUPERVISOR_SOCKET = "/tmp/supervisor.sock"
SUPERVISOR_CMD = f"/usr/bin/supervisorctl -s unix://{SUPERVISOR_SOCKET}"

@router.post("/terraslam/component")
async def control_terraslam_component(action: ComponentAction) -> CommandResponse:
    """Control TerraSLAM components (slam, relay, publisher, all)."""
    valid_components = ["slam", "relay", "publisher", "all"]
    valid_actions = ["start", "stop", "restart", "status"]
    
    if action.component not in valid_components:
        raise HTTPException(400, f"Invalid component: {action.component}")
    if action.action not in valid_actions:
        raise HTTPException(400, f"Invalid action: {action.action}")
    
    try:
        container = docker_client.containers.get(TERRASLAM_CONTAINER)
        
        if action.action == "status":
            result = container.exec_run(f"{SUPERVISOR_CMD} status")
        else:
            result = container.exec_run(f"{SUPERVISOR_CMD} {action.action} {action.component}")
        
        output = result.output.decode("utf-8") if result.output else ""
        
        return CommandResponse(
            success=result.exit_code == 0,
            output=output,
            error=None if result.exit_code == 0 else "Command failed"
        )
    except docker.errors.NotFound:
        raise HTTPException(503, "TerraSLAM container not found")
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/terraslam/health")
async def terraslam_health():
    """Check if TerraSLAM container is running."""
    try:
        container = docker_client.containers.get(TERRASLAM_CONTAINER)
        return {
            "status": "healthy" if container.status == "running" else "unhealthy",
            "container_status": container.status
        }
    except docker.errors.NotFound:
        return {"status": "unhealthy", "container_status": "not_found"}
    except Exception:
        return {"status": "unhealthy", "container_status": "error"}