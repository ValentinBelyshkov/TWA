from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from pathlib import Path
import uuid
import shutil
import json

from fastapi.encoders import jsonable_encoder

router = APIRouter()

def get_projects_root(request: Request) -> Path:
    """Get projects root path from app state."""
    return request.app.state.projects_path

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

def ensure_projects_directory(projects_root: Path):
    """Ensure the projects directory exists."""
    projects_root.mkdir(parents=True, exist_ok=True)

def get_project_path(projects_root: Path, project_id: str) -> Path:
    """Get the path to a project directory."""
    return projects_root / project_id

def get_metadata_path(projects_root: Path, project_id: str) -> Path:
    """Get the path to a project's metadata.json file."""
    return get_project_path(projects_root, project_id) / "metadata.json"

def read_project_metadata(projects_root: Path, project_id: str) -> Optional[Project]:
    """Read and validate project metadata from JSON file."""
    metadata_path = get_metadata_path(projects_root, project_id)
    if not metadata_path.exists():
        return None
    
    try:
        with open(metadata_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return Project.model_validate(data)
    except Exception:
        return None

def write_project_metadata(projects_root: Path, project: Project) -> None:
    """Write project metadata to JSON file and create project structure."""
    project_path = get_project_path(projects_root, project.id)
    project_path.mkdir(parents=True, exist_ok=True)
    
    # Create subdirectories
    (project_path / "logs").mkdir(exist_ok=True)
    (project_path / "calibrations").mkdir(exist_ok=True)
    (project_path / "photos").mkdir(exist_ok=True)
    
    metadata_path = get_metadata_path(projects_root, project.id)
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(jsonable_encoder(project), f, indent=2, ensure_ascii=False)

@router.get("", response_model=List[Project])
async def get_projects(request: Request):
    projects_root = get_projects_root(request)
    ensure_projects_directory(projects_root)
    projects = []
    
    if projects_root.exists():
        for project_dir in projects_root.iterdir():
            if project_dir.is_dir():
                project = read_project_metadata(projects_root, project_dir.name)
                if project:
                    projects.append(project)
    
    return projects

@router.post("", response_model=Project)
async def create_project(request: Request, project: ProjectCreate):
    projects_root = get_projects_root(request)
    ensure_projects_directory(projects_root)
    
    new_project = Project(
        id=str(uuid.uuid4()),
        name=project.name,
        type=project.type,
        created_at=datetime.now(),
        video_filename=project.video_filename,
        calibration_status="not_calibrated"
    )
    
    write_project_metadata(projects_root, new_project)
    return new_project

@router.get("/{project_id}", response_model=Project)
async def get_project(request: Request, project_id: str):
    projects_root = get_projects_root(request)
    project = read_project_metadata(projects_root, project_id)
    
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return project

@router.put("/{project_id}", response_model=Project)
async def update_project(request: Request, project_id: str, project: ProjectBase):
    projects_root = get_projects_root(request)
    existing_project = read_project_metadata(projects_root, project_id)
    
    if existing_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    existing_project.name = project.name
    existing_project.type = project.type
    
    write_project_metadata(projects_root, existing_project)
    return existing_project

@router.delete("/{project_id}")
async def delete_project(request: Request, project_id: str):
    projects_root = get_projects_root(request)
    project_path = get_project_path(projects_root, project_id)
    
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    
    shutil.rmtree(project_path)
    return {"message": "Project deleted"}

@router.post("/{project_id}/video")
async def upload_video(request: Request, project_id: str, file: UploadFile = File(...)):
    projects_root = get_projects_root(request)
    project = read_project_metadata(projects_root, project_id)
    
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project_path = get_project_path(projects_root, project_id)
    videos_dir = project_path / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)
    
    save_path = videos_dir / file.filename
    
    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    project.video_filename = str(save_path)
    write_project_metadata(projects_root, project)
    
    return {"message": "Video uploaded", "filename": str(save_path)}