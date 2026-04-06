import os
import uuid
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import aiofiles

router = APIRouter()

class CalibrationFramePoint(BaseModel):
    x: float
    y: float

class CalibrationFrame(BaseModel):
    points: List[CalibrationFramePoint]

class CalibrationSaveRequest(BaseModel):
    project_id: str
    frames: List[CalibrationFrame]
    frame_urls: List[str]

calibrations_db = {}

@router.post("/start")
async def start_calibration(project_id: str):
    """
    Simulates 15-second recording and returns 3 frame URLs.
    In production, this would connect to drone camera and record video.
    """
    frames_dir = f"/app/calibrations/{project_id}"
    os.makedirs(frames_dir, exist_ok=True)
    
    frame_urls = []
    for i in range(3):
        frame_path = f"{frames_dir}/frame_{i}.jpg"
        
        img = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        cv2.imwrite(frame_path, img)
        
        frame_urls.append(f"/api/calibration/frames/{project_id}/frame_{i}.jpg")
    
    return {
        "project_id": project_id,
        "frames": frame_urls,
        "duration": 15,
        "status": "completed"
    }

@router.get("/frames/{project_id}/{frame_name}")
async def get_frame(project_id: str, frame_name: str):
    """Serve calibration frame images."""
    frame_path = f"/app/calibrations/{project_id}/{frame_name}"
    if not os.path.exists(frame_path):
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

@router.post("/save")
async def save_calibration(request: CalibrationSaveRequest):
    """Save calibration with point data from 5 points on each of 3 frames."""
    if len(request.frames) != 3:
        raise HTTPException(status_code=400, detail="Must provide 3 frames")
    
    for frame in request.frames:
        if len(frame.points) != 5:
            raise HTTPException(status_code=400, detail="Each frame must have exactly 5 points")
    
    calibration_id = str(uuid.uuid4())
    calibration_data = {
        "id": calibration_id,
        "project_id": request.project_id,
        "frames": [frame.dict() for frame in request.frames],
        "frame_urls": request.frame_urls,
        "created_at": datetime.now().isoformat()
    }
    
    calibrations_db[calibration_id] = calibration_data
    
    cal_file_path = f"/app/calibrations/{request.project_id}/calibration.gpc"
    with open(cal_file_path, "w") as f:
        f.write(f"image.jpg\n")
        f.write(f"15\n")
        for frame in request.frames:
            for point in frame.points:
                f.write(f"{point.x:.2f} {point.y:.2f} 37.617300 55.755800 0.00\n")
    
    for project in projects_db:
        if project.id == request.project_id:
            project.calibration_status = "calibrated"
            break
    
    return {
        "calibration_id": calibration_id,
        "calibration_file": cal_file_path,
        "status": "saved"
    }

@router.get("/status/{project_id}")
async def get_calibration_status(project_id: str):
    """Check if project has calibration."""
    cal_file_path = f"/app/calibrations/{project_id}/calibration.gpc"
    calibrated = os.path.exists(cal_file_path)
    
    return {
        "project_id": project_id,
        "calibrated": calibrated,
        "calibration_file": cal_file_path if calibrated else None
    }

from fastapi.responses import StreamingResponse
from app.routers import projects