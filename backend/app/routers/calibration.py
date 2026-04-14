import os
import uuid
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import aiofiles

from app.routers.projects import (
    get_projects_root,
    get_project_path,
    read_project_metadata,
    write_project_metadata,
)

router = APIRouter()

class CalibrationPointRequest(BaseModel):
    imageX: float
    imageY: float
    lat: float
    lng: float
    altitude: float

class GCPSaveRequest(BaseModel):
    image_filename: str
    points: List[CalibrationPointRequest]

class CalibrationStatusResponse(BaseModel):
    project_id: str
    calibrated: bool
    calibration_file: Optional[str] = None

@router.post("/{project_id}/upload-image")
async def upload_calibration_image(request: Request, project_id: str, file: UploadFile = File(...)):
    """Upload a calibration image to the project folder."""
    projects_root = get_projects_root(request)
    project = read_project_metadata(projects_root, project_id)
    
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project_path = get_project_path(projects_root, project_id)
    calibrations_dir = project_path / "calibrations"
    calibrations_dir.mkdir(parents=True, exist_ok=True)
    
    # Use original filename for the calibration image
    save_path = calibrations_dir / file.filename
    
    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    return {
        "success": True,
        "image_filename": file.filename,
        "image_url": f"/api/projects/{project_id}/calibrations/{file.filename}"
    }

@router.get("/{project_id}/calibrations/{image_name}")
async def get_calibration_image(request: Request, project_id: str, image_name: str):
    """Serve calibration images from the project folder."""
    projects_root = get_projects_root(request)
    project_path = get_project_path(projects_root, project_id)
    image_path = project_path / "calibrations" / image_name
    
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Determine content type based on extension
    ext = image_name.lower().split('.')[-1] if '.' in image_name else 'jpg'
    content_type = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    }.get(ext, 'image/jpeg')
    
    async def file_iterator():
        async with aiofiles.open(image_path, 'rb') as f:
            while True:
                chunk = await f.read(8192)
                if not chunk:
                    break
                yield chunk
    
    return StreamingResponse(
        file_iterator(),
        media_type=content_type,
        headers={"Content-Disposition": f"inline; filename={image_name}"}
    )

@router.post("/{project_id}/save-gcp")
async def save_gcp_file(request: Request, project_id: str, gcp_request: GCPSaveRequest):
    """Save GCP (Ground Control Points) file with +proj=utm header."""
    projects_root = get_projects_root(request)
    project = read_project_metadata(projects_root, project_id)
    
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if len(gcp_request.points) != 5:
        raise HTTPException(status_code=400, detail="Must provide exactly 5 points")
    
    project_path = get_project_path(projects_root, project_id)
    calibrations_dir = project_path / "calibrations"
    calibrations_dir.mkdir(parents=True, exist_ok=True)
    
    gcp_filename = f"{Path(gcp_request.image_filename).stem}.gpc"
    gcp_path = calibrations_dir / gcp_filename
    
    # Generate GCP file content with +proj=utm header
    gpc_content = f"+proj=utm +zone=37 +datum=WGS84\n"
    gpc_content += f"{gcp_request.image_filename}\n"
    gpc_content += f"{len(gcp_request.points)}\n"
    
    for point in gcp_request.points:
        # Format: x y lng lat altitude
        gpc_content += f"{point.imageX:.6f} {point.imageY:.6f} {point.lng:.6f} {point.lat:.6f} {point.altitude:.2f}\n"
    
    with open(gcp_path, "w", encoding="utf-8") as f:
        f.write(gpc_content)
    
    # Update project metadata
    project.calibration_status = "calibrated"
    write_project_metadata(projects_root, project)
    
    return {
        "success": True,
        "gcp_filename": gcp_filename,
        "calibration_status": "calibrated"
    }

@router.get("/{project_id}/status")
async def get_calibration_status(request: Request, project_id: str):
    """Check if project has calibration."""
    projects_root = get_projects_root(request)
    project = read_project_metadata(projects_root, project_id)
    
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project_path = get_project_path(projects_root, project_id)
    calibrations_dir = project_path / "calibrations"
    
    if not calibrations_dir.exists():
        return {
            "project_id": project_id,
            "calibrated": False,
            "calibration_file": None
        }
    
    # Find any .gpc files
    gpc_files = list(calibrations_dir.glob("*.gpc"))
    
    if gpc_files:
        return {
            "project_id": project_id,
            "calibrated": True,
            "calibration_file": str(gpc_files[0])
        }
    
    return {
        "project_id": project_id,
        "calibrated": False,
        "calibration_file": None
    }

# Legacy endpoints for backward compatibility

@router.post("/start")
async def start_calibration(request: Request, project_id: str):
    """
    Simulates 15-second recording and returns 3 frame URLs.
    In production, this would connect to drone camera and record video.
    """
    calibration_path = request.app.state.calibration_path
    frames_dir = calibration_path / project_id
    frames_dir.mkdir(parents=True, exist_ok=True)
    
    frame_urls = []
    for i in range(3):
        frame_path = frames_dir / f"frame_{i}.jpg"
        
        # Create a simple placeholder image
        import numpy as np
        import cv2
        img = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        cv2.imwrite(str(frame_path), img)
        
        frame_urls.append(f"/api/projects/calibration/frames/{project_id}/frame_{i}.jpg")
    
    return {
        "project_id": project_id,
        "frames": frame_urls,
        "duration": 15,
        "status": "completed"
    }

@router.get("/frames/{project_id}/{frame_name}")
async def get_frame(request: Request, project_id: str, frame_name: str):
    """Serve calibration frame images."""
    calibration_path = request.app.state.calibration_path
    frame_path = calibration_path / project_id / frame_name
    if not frame_path.exists():
        raise HTTPException(status_code=404, detail="Frame not found")
    
    async def file_iterator():
        async with aiofiles.open(frame_path, 'rb') as f:
            while True:
                chunk = await f.read(8192)
                if not chunk:
                    break
                yield chunk
    
    return StreamingResponse(
        file_iterator(),
        media_type="image/jpeg",
        headers={"Content-Disposition": f"inline; filename={frame_name}"}
    )
