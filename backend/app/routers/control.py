from fastapi import APIRouter
from pydantic import BaseModel
from typing import Literal

router = APIRouter()

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