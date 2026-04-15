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
SUPERVISOR_CONF_PATH = "/etc/supervisor/conf.d/terraslam.conf"

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

# Process patterns for killing orphaned processes (matches control.sh)
PROCESS_PATTERNS = {
    "slam": "orb_slam3|slam_core|rgbd|mono",
    "relay": "relay.py",
    "publisher": "image_publish.py",
    "publisher:folder": "image_publish.py.*folder",
    "publisher:realsense": "realsense.py",
}

def kill_processes(container, component: str):
    """Force kill orphaned processes for a component."""
    pattern = PROCESS_PATTERNS.get(component)
    if not pattern and ":" in component:
        pattern = PROCESS_PATTERNS.get(component.split(":")[0])
    
    if not pattern:
        return
    
    # Find PIDs
    find_cmd = f"ps aux | grep -E '{pattern}' | grep -v grep | awk '{{print $2}}'"
    res = container.exec_run(f"bash -c \"{find_cmd}\"")
    pids = res.output.decode().strip()
    
    if pids:
        pids_list = pids.split()
        pids_str = " ".join(pids_list)
        container.exec_run(f"bash -c \"kill -9 {pids_str}\"")

def set_publisher_folder_path(container, new_path: str):
    """Update VIDEO_FOLDER in supervisor config for simulation mode."""
    # Check if directory exists
    res = container.exec_run(f"test -d {new_path}")
    if res.exit_code != 0:
        return False, f"Directory '{new_path}' does not exist inside container!"
    
    escaped_new = new_path.replace("/", "\\/")
    
    # Update supervisor config using sed (same as control.sh)
    sed_cmd = (
        f"sed -i '/\\[program:image_publisher_folder\\]/,/^\\[/ {{"
        f"/^environment=/ s/VIDEO_FOLDER=\"[^\"]*\"/VIDEO_FOLDER=\"{escaped_new}\"/"
        f"}}' {SUPERVISOR_CONF_PATH}"
    )
    
    # Make backup and apply sed
    res = container.exec_run(f"bash -c \"cp {SUPERVISOR_CONF_PATH} {SUPERVISOR_CONF_PATH}.bak && {sed_cmd}\"")
    
    if res.exit_code == 0:
        # Tell supervisor to reread and update
        container.exec_run(f"{SUPERVISOR_CMD} reread")
        container.exec_run(f"{SUPERVISOR_CMD} update image_publisher_folder")
        return True, "Path updated successfully"
    else:
        return False, f"Failed to update config: {res.output.decode()}"

@router.post("/terraslam/component")
async def control_terraslam_component(action: ComponentAction, request: Request) -> CommandResponse:
    """Control TerraSLAM components (slam, relay, publisher, all)."""
    valid_components = ["slam", "relay", "publisher", "all", "publisher:folder", "publisher:realsense", "rosbridge"]
    valid_actions = ["start", "stop", "restart", "status", "kill"]
    
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

        # Handle kill action
        if action.action == "kill":
            if action.component == "all":
                for comp in ["slam", "relay", "publisher"]:
                    kill_processes(container, comp)
            else:
                kill_processes(container, action.component)
            return CommandResponse(success=True, output=f"Processes for {action.component} killed")

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
                kill_processes(container, comp)
                
            # Perform action on target components
            combined_output = ""
            success = True
            for comp in target_components:
                # Handle path for publisher folder
                if comp == "image_publisher_folder" and project and project.frames_path:
                    set_publisher_folder_path(container, project.frames_path)
                    # Also keep the old way for compatibility with current ROS node if it's already running
                    container.exec_run(f"bash -c \"echo '{project.frames_path}' > /tmp/terraslam_folder_path\"")
                    container.exec_run(f"bash -c \"ros2 param set /image_publisher_folder frames_path {project.frames_path} || true\"")

                # Kill before start if restarting or starting
                kill_processes(container, comp)
                
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
                set_publisher_folder_path(container, project.frames_path)
                container.exec_run(f"bash -c \"echo '{project.frames_path}' > /tmp/terraslam_folder_path\"")
                container.exec_run(f"bash -c \"ros2 param set /image_publisher_folder frames_path {project.frames_path} || true\"")
        
        if action.action in ["start", "restart"]:
            kill_processes(container, action.component)

        if action.action == "status":
            result = container.exec_run(f"{SUPERVISOR_CMD} status {supervisor_component}")
        else:
            result = container.exec_run(f"{SUPERVISOR_CMD} {action.action} {supervisor_component}")
        
        if action.action == "stop":
            kill_processes(container, action.component)

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