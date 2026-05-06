from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Literal, Optional
import docker
import asyncio
import logging
import os
import time
import shutil
from pathlib import Path
from ..utils.yaml_editor import update_slam_yaml
from ..utils.slam_publisher import start_image_publisher, stop_image_publisher
from app.routers.projects import (
    get_projects_root,
    read_project_metadata,
    get_project_path,
)

router = APIRouter()
logger = logging.getLogger(__name__)
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
SLAM_DB = "/home/orb/Database" 
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
                container.exec_run(f"bash -c \"echo '{mode}' > /tmp/terraslam_publisher_mode\"", user="orb")
                
                # If it's a simulation, ensure the folder path is set
                if mode == "folder":
                    container_frames_path = f"{SLAM_DB}/projects/{action.project_id}/frames"
                    container.exec_run(f"bash -c \"echo '{container_frames_path}' > /tmp/terraslam_folder_path\"", user="orb")

        # Handle YAML update for SLAM when starting
        if action.action in ["start", "restart"] and action.component in ["slam", "all"] and action.project_id:
            yaml_path = "/app/trajectory-db/real.yaml"
            load_path = None
            if project and project.calibration_status == "calibrated":
                load_path = f"/home/orb/Database/projects/{action.project_id}/calibrations/map.osa"
            
            logger.info(f"Updating SLAM YAML before {action.action}: load_filename={load_path}")
            update_slam_yaml(yaml_path, save_filename=None, load_filename=load_path)

        # Handle selective component control for "all"
        if action.component == "all" and action.action in ["start", "restart", "stop"]:
            if project and project.type == "симуляция":
                target_components = ["slam_core", "relay", "image_publisher_folder", "rosbridge"]
                others = ["image_publisher_realsense"]
            else:
                target_components = ["slam_core", "relay", "image_publisher_realsense", "rosbridge"]
                others = ["image_publisher_folder"]
            
            # Stop components that should not be running in this mode
            for comp in others:
                if comp in ["image_publisher_folder", "image_publisher_realsense"]:
                    publisher_mode = "folder" if comp == "image_publisher_folder" else "realsense"
                    stop_image_publisher(container, mode=publisher_mode)
                else:
                    container.exec_run(f"{SUPERVISOR_CMD} stop {comp}")
                
            # Perform action on target components
            combined_output = ""
            success = True
            for comp in target_components:
                # Handle publisher components separately
                if comp in ["image_publisher_folder", "image_publisher_realsense"]:
                    publisher_mode = "folder" if comp == "image_publisher_folder" else "realsense"
                    if action.action in ["start", "restart"]:
                        if action.action == "restart":
                            stop_image_publisher(container, mode=publisher_mode)
                            
                        if not action.project_id:
                            combined_output += f"Publisher {publisher_mode} failed: project_id missing\n"
                            success = False
                            continue
                        frames_dir = f"{SLAM_DB}/projects/{action.project_id}/frames"
                        pub_success = await start_image_publisher(
                            container=container,
                            frames_dir=frames_dir,
                            video_folder_env=frames_dir,
                            mode=publisher_mode
                        )
                        combined_output += f"Publisher {publisher_mode} started: {pub_success}\n"
                        if not pub_success:
                            success = False
                    elif action.action == "stop":
                        pub_success = stop_image_publisher(container, mode=publisher_mode)
                        combined_output += f"Publisher {publisher_mode} stopped: {pub_success}\n"
                    continue

                # Handle path for other components
                if comp == "relay" and action.project_id:
                    calib_path = f"/home/orb/Database/projects/{action.project_id}/calibrations/calib.txt"
                    container.exec_run(f"bash -c \"echo '{calib_path}' > /tmp/terraslam_relay_calib_path\"", user="orb")
                # ===================
                res = container.exec_run(f"{SUPERVISOR_CMD} {action.action} {comp}")
                combined_output += res.output.decode("utf-8") + "\n"
                if res.exit_code != 0:
                    output_str = res.output.decode("utf-8")
                    if "already started" not in output_str:
                        success = False
            
            return CommandResponse(success=success, output=combined_output)

        # Resolve single component name for supervisor
        supervisor_component = COMPONENT_MAPPING.get(action.component, action.component)
        
        # If the component is "publisher", resolve it to the specific publisher mode
        if action.component == "publisher" and project:
            supervisor_component = "image_publisher_folder" if project.type == "симуляция" else "image_publisher_realsense"

        # Handle individual publisher control bypassing supervisor
        if supervisor_component in ["image_publisher_folder", "image_publisher_realsense"]:
            publisher_mode = "folder" if supervisor_component == "image_publisher_folder" else "realsense"
            if action.action in ["start", "restart"]:
                if action.action == "restart":
                    stop_image_publisher(container, mode=publisher_mode)

                if not action.project_id:
                    raise HTTPException(400, "project_id is required to start publisher")
                frames_dir = f"{SLAM_DB}/projects/{action.project_id}/frames"
                pub_success = await start_image_publisher(
                    container=container,
                    frames_dir=frames_dir,
                    video_folder_env=frames_dir,
                    mode=publisher_mode
                )
                return CommandResponse(
                    success=pub_success,
                    output=f"Publisher {publisher_mode} started: {pub_success}",
                    error=None if pub_success else "Failed to start publisher"
                )
            elif action.action == "stop":
                pub_success = stop_image_publisher(container, mode=publisher_mode)
                return CommandResponse(
                    success=pub_success,
                    output=f"Publisher {publisher_mode} stopped: {pub_success}",
                    error=None if pub_success else "Failed to stop publisher"
                )
            elif action.action == "status":
                check_cmd = "pgrep -f 'python3.*image_publish.py'" if publisher_mode == "folder" else "pgrep -f 'python3.*realsense.py'"
                res = container.exec_run(check_cmd, user="orb")
                is_running = res.exit_code == 0
                return CommandResponse(
                    success=True,
                    output=f"{supervisor_component} {'RUNNING' if is_running else 'STOPPED'}",
                    error=None
                )

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
async def slam_test_run(request: Request, project_id: Optional[str] = None):
    import time
    t_start = time.time()
    print(f"[TEST-RUN] Start. project_id={project_id}")
    
    try:
        # === ШАГ 0: YAML ===
        SHARED_DATABASE_PATH = "/app/trajectory-db"
        yaml_file = os.path.join(SHARED_DATABASE_PATH, "real.yaml")
        save_name = f"map"
        
        # Путь на хосте (где проверяет бэкенд)
        projects_root = get_projects_root(request)
        project_path = get_project_path(projects_root, project_id)
        host_calib_dir = project_path / "calibrations"
        host_calib_dir.mkdir(parents=True, exist_ok=True)
        
        # Очищаем папку procframe перед новой калибровкой
        procframe_dir = project_path / "procframe"
        if procframe_dir.exists():
            print(f"[TEST-RUN] Clearing procframe directory: {procframe_dir}")
            for item in procframe_dir.iterdir():
                try:
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
                except Exception as e:
                    print(f"[TEST-RUN] Warning: Could not delete {item}: {e}")
            print("[TEST-RUN] procframe directory cleared")
        else:
            procframe_dir.mkdir(parents=True, exist_ok=True)
            print(f"[TEST-RUN] procframe directory created: {procframe_dir}")
        
        # Путь внутри контейнера (куда пишет SLAM)
        # Предполагаем, что /home/orb/Database в контейнере = SHARED_DATABASE_PATH на хосте
        container_calib_dir = f"/home/orb/Database/projects/{project_id}/calibrations"
        container_save_path = f"{container_calib_dir}/{save_name}"
        
        print(f"[TEST-RUN] Host calib dir: {host_calib_dir}")
        print(f"[TEST-RUN] Container save path: {container_save_path}")
        
        # === ШАГ 0: YAML ===
        print(f"[TEST-RUN] Updating YAML: {yaml_file}")
        yaml_ok = update_slam_yaml(
            yaml_path=yaml_file, 
            save_filename=container_save_path,  # ← полный путь!
            load_filename=None
        )
        if not yaml_ok:
            raise Exception("YAML update failed")
        print(f"[TEST-RUN] YAML OK. Save name: {save_name}")
        
        # === ШАГ 1: Docker контейнер ===
        print(f"[TEST-RUN] Getting container: {TERRASLAM_CONTAINER}")
        container = docker_client.containers.get(TERRASLAM_CONTAINER)
        print(f"[TEST-RUN] Container found: {container.name}, status={container.status}")
        
        # === ШАГ 2: Запуск SLAM (с таймаутом через shell) ===
        slam_component = COMPONENT_MAPPING["slam"]
        cmd = f"bash -c 'timeout 10 {SUPERVISOR_CMD} start {slam_component} 2>&1 || true'"
        print(f"[TEST-RUN] Executing: {cmd}")
        
        start_result = container.exec_run(cmd)
        stdout = start_result.output.decode("utf-8", errors="replace") if start_result.output else ""
        print(f"[TEST-RUN] SLAM start exit_code={start_result.exit_code}, output={stdout.strip()}")
        
        # === ШАГ 3: Пути ===
        if not project_id:
            raise Exception("project_id required")
            
        frames_dir_slam = f"{SLAM_DB}/projects/{project_id}/frames"
        print(f"[TEST-RUN] frames_dir={frames_dir_slam}")
        
        # === ШАГ 4: Публикатор (с таймаутом) ===
        print("[TEST-RUN] Starting image publisher...")
        
        # Определяем режим на основе типа проекта
        project = read_project_metadata(projects_root, project_id)
        publisher_mode = "folder" if (project and project.type == "симуляция") else "realsense"
        print(f"[TEST-RUN] Publisher mode: {publisher_mode}")
        
        try:
            publisher_ok = await asyncio.wait_for(
                start_image_publisher(
                    container=container, 
                    frames_dir=frames_dir_slam, 
                    video_folder_env=frames_dir_slam,
                    mode=publisher_mode
                ),
                timeout=15.0
            )
            print(f"[TEST-RUN] Publisher started: {publisher_ok}")
        except asyncio.TimeoutError:
            print("[TEST-RUN] WARNING: Publisher start timed out, continuing anyway")
            publisher_ok = False
        
        # === ШАГ 5: Ждём ===
        print("[TEST-RUN] Sleeping 10s...")
        await asyncio.sleep(15)
        
        # === ШАГ 6: Стоп ===
        print("[TEST-RUN] Stopping publisher...")
        try:
            stop_image_publisher(container, mode=publisher_mode)
        except Exception as e:
            print(f"[TEST-RUN] Publisher stop error: {e}")
        
        print("[TEST-RUN] Stopping SLAM...")
        stop_cmd = f"bash -c 'timeout 10 /usr/bin/supervisorctl -s unix:///tmp/supervisor.sock stop {slam_component} 2>&1 || true'"
        stop_result = await asyncio.get_running_loop().run_in_executor(None, lambda: container.exec_run(stop_cmd))
        print(f"[TEST-RUN] SLAM stop exit_code={stop_result.exit_code}")
        
        # === ШАГ 7: Проверка .osa ===
        projects_root = get_projects_root(request)
        project_path = get_project_path(projects_root, project_id)
        calibrations_dir = project_path / "calibrations"
        
        expected_file = calibrations_dir / f"{save_name}.osa"
        print(f"[TEST-RUN] Looking for: {expected_file}")
        
        if not expected_file.exists():
            recent = [f for f in calibrations_dir.glob("*.osa") if f.stat().st_mtime > time.time() - 60]
            if recent:
                expected_file = recent[0]
                print(f"[TEST-RUN] Found recent: {expected_file}")
            else:
                print("[TEST-RUN] ERROR: No .osa file found!")
                return CommandResponse(success=False,output="",error="No .osa created")
        
        print(f"[TEST-RUN] Done in {time.time()-t_start:.1f}s")
        return CommandResponse(success=True,output="", data={"saved_map": expected_file.name})
        
    except Exception as e:
        print(f"[TEST-RUN] FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))
