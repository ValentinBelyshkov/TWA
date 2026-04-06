from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid

router = APIRouter()

class ProjectBase(BaseModel):
    name: str
    type: str

class ProjectCreate(ProjectBase):
    video_filename: Optional[str] = None

class Project(ProjectBase):
    id: str
    created_at: datetime
    video_filename: Optional[str] = None
    calibration_status: str = "not_calibrated"

projects_db: List[Project] = []

@router.get("", response_model=List[Project])
async def get_projects():
    return projects_db

@router.post("", response_model=Project)
async def create_project(project: ProjectCreate):
    new_project = Project(
        id=str(uuid.uuid4()),
        name=project.name,
        type=project.type,
        created_at=datetime.now(),
        video_filename=project.video_filename,
        calibration_status="not_calibrated"
    )
    projects_db.append(new_project)
    return new_project

@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str):
    for project in projects_db:
        if project.id == project_id:
            return project
    raise HTTPException(status_code=404, detail="Project not found")

@router.put("/{project_id}", response_model=Project)
async def update_project(project_id: str, project: ProjectBase):
    for idx, p in enumerate(projects_db):
        if p.id == project_id:
            projects_db[idx].name = project.name
            projects_db[idx].type = project.type
            return projects_db[idx]
    raise HTTPException(status_code=404, detail="Project not found")

@router.delete("/{project_id}")
async def delete_project(project_id: str):
    global projects_db
    projects_db = [p for p in projects_db if p.id != project_id]
    return {"message": "Project deleted"}

@router.post("/{project_id}/video")
async def upload_video(project_id: str, file: UploadFile = File(...)):
    for project in projects_db:
        if project.id == project_id:
            save_path = f"/app/uploads/{project_id}_{file.filename}"
            with open(save_path, "wb") as f:
                content = await file.read()
                f.write(content)
            project.video_filename = save_path
            return {"message": "Video uploaded", "filename": save_path}
    raise HTTPException(status_code=404, detail="Project not found")