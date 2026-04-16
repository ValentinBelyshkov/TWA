from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Literal, Optional
import docker

from app.routers.projects import (
    get_projects_root,
    read_project_metadata,
)

router = APIRouter()

docker_client = docker.from_env()

class ComponentAction(BaseModel):
    component: str
    action: str
    project_id: Optional[str] = None

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

# Component mappings (matches control.sh)
COMPONENT_MAPPING = {
    "slam": "slam_core",
    "relay": "relay",
    "publisher": "image_publisher",  # Generic alias - will resolve to active mode
    "publisher:folder": "image_publisher_folder",
    "publisher:realsense": "image_publisher_realsense",
    "rosbridge": "rosbridge",
}

# Log file name mapping (program name -> actual log filename)
LOG_NAMES = {
    "slam_core": "slam_core",
    "relay": "relay",
    "image_publisher_folder": "publisher_folder",
    "image_publisher_realsense": "publisher_realsense",
}


@router.post("/terraslam/component")
async def control_terraslam_component(action: ComponentAction, request: Request) -> CommandResponse:
    """Control TerraSLAM components (slam, relay, publisher, all)."""
    valid_components = ["slam", "relay", "publisher", "all", "publisher:folder", "publisher:realsense", "rosbridge"]
    valid_actions = ["start", "stop", "restart", "status"]
    
    if action.component not in valid_components:
        raise HTTPException(400, f"Invalid component: {action.component}")
    if action.action not in valid_actions:
        raise HTTPException(400, f"Invalid action: {action.action}")
    
    try:
        container = docker_client.containers.get(TERRASLAM_CONTAINER)
        
        # Get project info
        projects_root = get_projects_root(request)
        project = None
        if action.project_id:
            project = read_project_metadata(projects_root, action.project_id)
            if project:
                # Set publisher mode for status check
                mode = "folder" if project.type == "симуляция" else "realsense"
                container.exec_run(f"bash -c \"echo '{mode}' > /tmp/terraslam_publisher_mode\"")

        # Handle selective component control for "all"
        if action.component == "all" and action.action in ["start", "restart"]:
            if project and project.type == "симуляция":
                target_components = ["slam_core", "relay", "image_publisher_folder"]
                others = ["image_publisher_realsense", "rosbridge"]
            else:
                target_components = ["slam_core", "relay", "image_publisher_realsense", "rosbridge"]
                others = ["image_publisher_folder"]
            
            # Stop components that should not be running in this mode
            for comp in others:
                container.exec_run(f"{SUPERVISOR_CMD} stop {comp}")
                
            # Perform action on target components
            combined_output = ""
            success = True
            for comp in target_components:
                # Handle path for publisher folder
                if comp == "image_publisher_folder" and project and project.frames_path:
                    # Write to file
                    container.exec_run(f"bash -c \"echo '{project.frames_path}' > /tmp/terraslam_folder_path\"")
                    # Also try to pass as parameter if the component is already running (for ROS2)
                    container.exec_run(f"bash -c \"ros2 param set /image_publisher_folder frames_path {project.frames_path} || true\"")

                res = container.exec_run(f"{SUPERVISOR_CMD} {action.action} {comp}")
                combined_output += res.output.decode("utf-8") + "\n"
                if res.exit_code != 0:
                    output_str = res.output.decode("utf-8")
                    if "already started" not in output_str:
                        success = False
            
            return CommandResponse(success=success, output=combined_output)

        # Resolve single component name for supervisor
        supervisor_component = COMPONENT_MAPPING.get(action.component, action.component)

        # Handle folder path for image_publisher_folder when called individually
        if action.project_id and action.component in ["publisher", "publisher:folder"]:
            if project and project.frames_path:
                container.exec_run(f"bash -c \"echo '{project.frames_path}' > /tmp/terraslam_folder_path\"")
                container.exec_run(f"bash -c \"ros2 param set /image_publisher_folder frames_path {project.frames_path} || true\"")
        
        if action.action == "status":
            result = container.exec_run(f"{SUPERVISOR_CMD} status {supervisor_component}")
        else:
            result = container.exec_run(f"{SUPERVISOR_CMD} {action.action} {supervisor_component}")
        
        output = result.output.decode("utf-8") if result.output else ""
        
        return CommandResponse(
            success=result.exit_code == 0 or "already started" in output,
            output=output,
            error=None if (result.exit_code == 0 or "already started" in output) else f"Command failed with exit code {result.exit_code}"
        )
    except docker.errors.NotFound:
        raise HTTPException(503, "TerraSLAM container not found")
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/terraslam/status")
async def get_terraslam_status():
    """Get detailed status of all TerraSLAM components including system status from logs."""
    try:
        container = docker_client.containers.get(TERRASLAM_CONTAINER)
        
        # Get supervisor status for all components
        result = container.exec_run(f"{SUPERVISOR_CMD} status all")
        supervisor_output = result.output.decode("utf-8") if result.output else ""
        
        # Parse individual component statuses
        components_status = {}
        for line in supervisor_output.strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split()
            if len(parts) >= 2:
                comp_name = parts[0]
                status = parts[1]
                components_status[comp_name] = status
        
        # Check for orphaned processes
        orphaned_processes = {}
        process_patterns = {
            "slam": "orb_slam3|slam_core|rgbd|mono",
            "relay": "relay.py",
            "publisher": "image_publish.py",
            "publisher:folder": "image_publish.py.*folder",
            "publisher:realsense": "realsense.py",
        }
        
        for comp, pattern in process_patterns.items():
            result = container.exec_run(
                f"/bin/bash -c \"ps aux | grep -E '{pattern}' | grep -v grep | wc -l\""
            )
            count = int(result.output.decode("utf-8").strip()) if result.output else 0
            if count > 0:
                orphaned_processes[comp] = count
        
        # Get publisher mode
        mode_result = container.exec_run("cat /tmp/terraslam_publisher_mode 2>/dev/null || echo 'folder'")
        publisher_mode = mode_result.output.decode("utf-8").strip() if mode_result.output else "folder"
        
        # Determine overall system status
        # System is working if all main components are RUNNING and no orphaned processes
        main_components = ["slam_core", "relay"]
        if publisher_mode == "folder":
            main_components.append("image_publisher_folder")
        else:
            main_components.append("image_publisher_realsense")
            main_components.append("rosbridge")
        
        all_running = all(
            components_status.get(comp, "") == "RUNNING" 
            for comp in main_components
        )
        has_orphans = len(orphaned_processes) > 0
        
        if all_running and not has_orphans:
            system_status = "working"
        elif has_orphans:
            system_status = "warning"
        else:
            system_status = "not_working"
        
        return {
            "system_status": system_status,
            "components": components_status,
            "publisher_mode": publisher_mode,
            "orphaned_processes": orphaned_processes,
            "supervisor_output": supervisor_output
        }
    except docker.errors.NotFound:
        return {"system_status": "not_working", "error": "Container not found"}
    except Exception as e:
        return {"system_status": "error", "error": str(e)}


@router.get("/terraslam/logs/{component}")
async def get_terraslam_logs(component: str, lines: int = 50):
    """Get recent logs for a specific component."""
    try:
        container = docker_client.containers.get(TERRASLAM_CONTAINER)
        
        # Resolve component name
        supervisor_name = COMPONENT_MAPPING.get(component, component)
        log_name = LOG_NAMES.get(supervisor_name, supervisor_name)
        
        # Get stderr logs (ROS 2 sends all logs here)
        result = container.exec_run(f"tail -{lines} /var/log/supervisor/{log_name}.err.log")
        stderr_logs = result.output.decode("utf-8") if result.output else ""
        
        # Get stdout logs
        result = container.exec_run(f"tail -{lines} /var/log/supervisor/{log_name}.out.log")
        stdout_logs = result.output.decode("utf-8") if result.output else ""
        
        # Parse logs for status indicators (like the check_queue function)
        status_indicators = {
            "tracking_lost": False,
            "not_initialized": False,
            "initializing": False,
            "valid_data": False
        }
        
        # Look for special coordinate patterns in logs
        for line in stderr_logs.split("\n"):
            if "-3.0" in line and "tracking" in line.lower():
                status_indicators["tracking_lost"] = True
            elif "-1.0" in line and "init" in line.lower():
                status_indicators["not_initialized"] = True
            elif "initializing" in line.lower() or "waiting" in line.lower():
                status_indicators["initializing"] = True
            elif any(c.isdigit() for c in line) and "lat" in line.lower():
                status_indicators["valid_data"] = True
        
        return {
            "component": component,
            "stderr_logs": stderr_logs,
            "stdout_logs": stdout_logs,
            "status_indicators": status_indicators
        }
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
        
        
@router.post("/terraslam/slam/test-run")
async def slam_test_run(project_id: Optional[str] = None):
    """
    Запускает SLAM, ждёт 10 секунд, потом автоматически останавливает.
    Удобно для тестов инициализации.
    """
    try:
        container = docker_client.containers.get(TERRASLAM_CONTAINER)
        
        # 1. Запускаем slam
        slam_component = COMPONENT_MAPPING["slam"]  # "slam_core"
        start_result = container.exec_run(f"{SUPERVISOR_CMD} start {slam_component}")
        
        if start_result.exit_code != 0 and "already started" not in start_result.output.decode("utf-8"):
            raise Exception(f"Failed to start SLAM: {start_result.output.decode('utf-8')}")
        
        # 2. Ждём 10 секунд (не блокируя сервер)
        await asyncio.sleep(10)
        
        # 3. Останавливаем slam
        stop_result = container.exec_run(f"{SUPERVISOR_CMD} stop {slam_component}")
        
        output = f"Started: {start_result.output.decode('utf-8')}\nStopped: {stop_result.output.decode('utf-8')}"
        
        return CommandResponse(
            success=stop_result.exit_code == 0,
            output=output
        )
        
    except docker.errors.NotFound:
        raise HTTPException(503, "TerraSLAM container not found")
    except Exception as e:
        raise HTTPException(500, f"Error in test-run: {str(e)}")
