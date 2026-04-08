import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.routers import projects, calibration, telemetry, control

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(os.getenv("VIDEO_SAVE_PATH", "/app/uploads"), exist_ok=True)
    os.makedirs(os.getenv("CALIBRATION_PATH", "/app/calibrations"), exist_ok=True)
    os.makedirs(os.getenv("PROJECTS_PATH", "/app/projects"), exist_ok=True)
    yield

app = FastAPI(title="Visual Odometry API", lifespan=lifespan)

origins = os.getenv("CORS_ORIGINS", "http://localhost:8080").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Projects router (includes calibration endpoints for projects)
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
# Mount calibration sub-router under projects
app.include_router(calibration.router, prefix="/api/projects", tags=["calibration"])

# Standalone telemetry and control routers
app.include_router(telemetry.router, prefix="/api/telemetry", tags=["telemetry"])
app.include_router(control.router, prefix="/api/control", tags=["control"])

@app.get("/health")
async def health_check():
    return {"status": "healthy"}