import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getProject,
  uploadCalibrationImage,
  saveGCPPoints,
  controlTerraSLAMComponent,
  type Project,
} from "@/lib/api";
import type { CalibrationPoint } from "@/components/CalibrationPointSelector";

export type CalibrationStep = "instructions" | "upload" | "pairing" | "complete";

export interface TelemetryData {
  height: number;
  speed: number;
  battery: number;
  status: "idle" | "recording" | "active";
}

export interface DronePosition {
  lat: number;
  lng: number;
}

export interface DronePath extends Array<DronePosition> {}

export function useProject(projectId: string | undefined) {
  const [isRecording, setIsRecording] = useState(false);
  const [dronePosition, setDronePosition] = useState<DronePosition>({
    lat: 55.7558,
    lng: 37.6173,
  });
  const [dronePath, setDronePath] = useState<DronePath>([]);
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    height: 0,
    speed: 0,
    battery: 100,
    status: "idle",
  });
  const [showCalibration, setShowCalibration] = useState(true);
  const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>("instructions");
  const [uploadedImage, setUploadedImage] = useState<{
    filename: string;
    url: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasVideoStream, setHasVideoStream] = useState(false);

  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    data: project,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (project) {
      setShowCalibration(project.calibrationStatus !== "calibrated");
      setCalibrationStep(
        project.calibrationStatus === "calibrated" ? "complete" : "instructions"
      );
    }
  }, [project]);

  useEffect(() => {
    if (!projectId || calibrationStep !== "complete") return;

    const wsUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000"}/ws/video/${projectId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "frame" && message.data) {
          setHasVideoStream(true);
          const canvas = videoCanvasRef.current;
          if (!canvas) return;

          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
          };
          img.src = `data:image/jpeg;base64,${message.data}`;
        }
      } catch (e) {
        console.error("Video stream error:", e);
      }
    };

    ws.onerror = (e) => console.error("WebSocket error:", e);
    ws.onclose = () => console.log("Video WebSocket closed");

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId, calibrationStep]);

  const startRecording = useCallback(async () => {
    try {
      await controlTerraSLAMComponent("all", "start");
    } catch (err) {
      console.error("Failed to start TerraSLAM:", err);
    }

    setIsRecording(true);
    setTelemetry((prev) => ({ ...prev, status: "recording" }));
    setDronePath([{ lat: dronePosition.lat, lng: dronePosition.lng }]);

    let elapsed = 0;
    recordingIntervalRef.current = setInterval(() => {
      elapsed += 0.5;

      if (elapsed <= 15) {
        const newLat = dronePosition.lat + (Math.random() - 0.5) * 0.0002;
        const newLng = dronePosition.lng + (Math.random() - 0.5) * 0.0002;

        setDronePosition({ lat: newLat, lng: newLng });
        setDronePath((prev) => [...prev, { lat: newLat, lng: newLng }]);

        setTelemetry((prev) => ({
          ...prev,
          height: Math.round(elapsed * 10) / 10,
          speed: 1 + Math.random() * 0.5,
          battery: Math.max(0, 100 - elapsed * 2),
        }));
      } else {
        stopRecording();
      }
    }, 300);
  }, [dronePosition]);

  const stopRecording = useCallback(async () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    try {
      await controlTerraSLAMComponent("all", "stop");
    } catch (err) {
      console.error("Failed to stop TerraSLAM:", err);
    }

    setIsRecording(false);
    setTelemetry((prev) => ({ ...prev, status: "idle" }));
  }, []);

  const handleCalibrate = useCallback(() => {
    if (project?.calibrationStatus === "calibrated") {
      setCalibrationStep("complete");
    } else {
      setCalibrationStep("instructions");
    }
    setShowCalibration(false);
  }, [project?.calibrationStatus]);

  const handleInstructionsNext = useCallback(() => {
    setCalibrationStep("upload");
  }, []);

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!file || !projectId) return;

      setIsUploading(true);
      setUploadError(null);

      try {
        const result = await uploadCalibrationImage(projectId, file);
        setUploadedImage({
          filename: result.image_filename,
          url: result.image_url,
        });
        setCalibrationStep("pairing");
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Ошибка загрузки изображения"
        );
      } finally {
        setIsUploading(false);
      }
    },
    [projectId]
  );

  const handleCalibrationComplete = useCallback(
    async (points: CalibrationPoint[]) => {
      if (!projectId || !uploadedImage) return;

      try {
        await saveGCPPoints(
          projectId,
          uploadedImage.filename,
          points.map((p) => ({
            imageX: p.imageX,
            imageY: p.imageY,
            lat: p.lat,
            lng: p.lng,
            altitude: p.altitude,
          }))
        );
        await refetch();
        setCalibrationStep("complete");
        setShowCalibration(false);
        setTelemetry((prev) => ({ ...prev, status: "active" }));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Ошибка сохранения точек");
      }
    },
    [projectId, uploadedImage, refetch]
  );

  const handleCalibrationCancel = useCallback(() => {
    setShowCalibration(true);
    setCalibrationStep("instructions");
    setUploadedImage(null);
  }, []);

  const clearUploadError = useCallback(() => {
    setUploadError(null);
  }, []);

  return {
    project,
    isLoading,
    error,
    isRecording,
    dronePosition,
    dronePath,
    telemetry,
    showCalibration,
    calibrationStep,
    uploadedImage,
    uploadError,
    isUploading,
    hasVideoStream,
    videoCanvasRef,
    startRecording,
    stopRecording,
    handleCalibrate,
    handleInstructionsNext,
    handleImageUpload,
    handleCalibrationComplete,
    handleCalibrationCancel,
    clearUploadError,
    refetch,
  };
}
