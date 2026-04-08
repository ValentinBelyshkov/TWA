const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface ProjectBackend {
  id: string;
  name: string;
  type: string;
  created_at: string;
  video_filename: string | null;
  calibration_status: string;
}

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  createdAt: Date;
  videoFilename: string | null;
  calibrationStatus: string;
}

export type ProjectType = "камера" | "симуляция";

function fromBackendProject(backend: ProjectBackend): Project {
  return {
    id: backend.id,
    name: backend.name,
    type: backend.type as ProjectType,
    createdAt: new Date(backend.created_at),
    videoFilename: backend.video_filename,
    calibrationStatus: backend.calibration_status,
  };
}

function toBackendCreate(project: {
  name: string;
  type: ProjectType;
}): { name: string; type: string } {
  return {
    name: project.name,
    type: project.type,
  };
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Request failed: ${response.status}`);
  }

  return response.json();
}

export async function getProjects(): Promise<Project[]> {
  const data = await request<ProjectBackend[]>("/api/projects");
  return data.map(fromBackendProject);
}

export async function getProject(projectId: string): Promise<Project> {
  const data = await request<ProjectBackend>(`/api/projects/${projectId}`);
  return fromBackendProject(data);
}

export async function createProject(
  name: string,
  type: ProjectType
): Promise<Project> {
  const data = await request<ProjectBackend>("/api/projects", {
    method: "POST",
    body: JSON.stringify(toBackendCreate({ name, type })),
  });
  return fromBackendProject(data);
}

export async function updateProject(
  projectId: string,
  name: string,
  type: ProjectType
): Promise<Project> {
  const data = await request<ProjectBackend>(`/api/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify(toBackendCreate({ name, type })),
  });
  return fromBackendProject(data);
}

export async function deleteProject(projectId: string): Promise<void> {
  await request<{ message: string }>(`/api/projects/${projectId}`, {
    method: "DELETE",
  });
}

export async function uploadProjectVideo(
  projectId: string,
  file: File
): Promise<{ message: string; filename: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectId}/video`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Upload failed: ${response.status}`);
  }

  return response.json();
}
