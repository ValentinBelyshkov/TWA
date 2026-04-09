import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.routers import projects, calibration, telemetry, control, video
from pathlib import Path

load_dotenv()

# Get the backend directory path
BACKEND_DIR = Path(__file__).parent.parent

def get_data_path(env_var: str, default_name: str) -> Path:
    """Get data path - use env variable or create in backend directory."""
    env_path = os.getenv(env_var)
    if env_path:
        return Path(env_path)
    # Default: create in backend/data directory for local development
    data_dir = BACKEND_DIR / "data"
    return data_dir / default_name

@asynccontextmanager
async def lifespan(app: FastAPI):
    video_path = get_data_path("VIDEO_SAVE_PATH", "uploads")
    calibration_path = get_data_path("CALIBRATION_PATH", "calibrations")
    projects_path = get_data_path("PROJECTS_PATH", "projects")
    
    video_path.mkdir(parents=True, exist_ok=True)
    calibration_path.mkdir(parents=True, exist_ok=True)
    projects_path.mkdir(parents=True, exist_ok=True)
    
    # Store paths in app state for routers to access
    app.state.video_path = video_path
    app.state.calibration_path = calibration_path
    app.state.projects_path = projects_path
    yield

app = FastAPI(title="Visual Odometry API", lifespan=lifespan)

# Configure CORS - allow all origins for development
origins = os.getenv("CORS_ORIGINS", "http://localhost:8080,http://localhost:8081,http://localhost:8082,http://localhost:8083,http://127.0.0.1:8080,http://127.0.0.1:8081,http://127.0.0.1:8082,http://127.0.0.1:8083").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Projects router (includes calibration endpoints for projects)
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
# Mount calibration sub-router under projects
app.include_router(calibration.router, prefix="/api/projects", tags=["calibration"])

# Standalone telemetry and control routers
app.include_router(telemetry.router, prefix="/api/telemetry", tags=["telemetry"])
app.include_router(control.router, prefix="/api/control", tags=["control"])
app.include_router(video.router, prefix="/api/video", tags=["video"])

@app.get("/health")
async def health_check():
    return {"status": "healthy"}