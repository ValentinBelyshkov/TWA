import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getProject,
  uploadCalibrationImage,
  saveGCPPoints,
  controlTerraSLAMComponent,
  getTerraSLAMStatus,
  type Project,
} from "@/lib/api";
import type { CalibrationPoint } from "@/components/CalibrationPointSelector";

export type CalibrationStep = "idle" | "instructions" | "test-run" | "upload" | "pairing" | "complete";

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

// NEW: GPS Status interface
export interface GPSStatus {
  hasSignal: boolean;
  lastUpdate: number | null;
  lat: number | null;
  lon: number | null;
  alt: number | null;
}

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
  const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>("idle");
  const [uploadedImage, setUploadedImage] = useState<{
    filename: string;
    url: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasVideoStream, setHasVideoStream] = useState(false);
  
  // NEW: GPS Status with timeout
  const [gpsStatus, setGpsStatus] = useState<GPSStatus>({
    hasSignal: false,
    lastUpdate: null,
    lat: null,
    lon: null,
    alt: null,
  });

  // System status from TerraSLAM
  const [systemStatus, setSystemStatus] = useState<{
    status: "working" | "warning" | "not_working" | "error";
    publisher_mode: string;
    components: Record<string, string>;
  } | null>(null);

  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const gpsWsRef = useRef<WebSocket | null>(null);
  const gpsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const isCalibrated = project?.calibrationStatus === "calibrated";
  const showCalibration = project ? !isCalibrated : true;

  useEffect(() => {
    if (project) {
      if (isCalibrated) {
        setCalibrationStep("complete");
      } else if (calibrationStep === "complete") {
        // If it was complete but now project says not calibrated, go back to idle
        setCalibrationStep("idle");
      }
    }
  }, [project, isCalibrated]);

  // Poll TerraSLAM system status
  useEffect(() => {
    if (!projectId || (calibrationStep !== "complete" && calibrationStep !== "idle")) return;

    const fetchStatus = async () => {
      try {
        const status = await getTerraSLAMStatus();
        setSystemStatus({
          status: status.system_status,
          publisher_mode: status.publisher_mode,
          components: status.components,
        });
      } catch (err) {
        console.error("Failed to fetch TerraSLAM status:", err);
        setSystemStatus({
          status: "error",
          publisher_mode: "unknown",
          components: {},
        });
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 3 seconds
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [projectId, calibrationStep]);

  // Video WebSocket (existing)
  useEffect(() => {
    if (!projectId || (calibrationStep !== "complete" && calibrationStep !== "idle")) return;

    const wsUrl = `${import.meta.env.VITE_WS_URL || "ws://localhost:8000"}/api/video/ws/${projectId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => console.log("✅ Video WebSocket connected");
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "frame" && message.data) {
        // Inside ws.onmessage, after parsing:
          setHasVideoStream(true);
          const canvas = videoCanvasRef.current;
          if (!canvas) return;

          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          // Decode base64 to binary (BGR format from ROS)
          const binaryString = atob(message.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          const width = 1280;
          const height = 720;
          canvas.width = width;
          canvas.height = height;
          
          const imgData = ctx.createImageData(width, height);
          
          // Convert BGR to RGBA
          for (let i = 0, j = 0; i < bytes.length; i += 3, j += 4) {
            imgData.data[j] = bytes[i + 2];     // R from B
            imgData.data[j + 1] = bytes[i + 1]; // G
            imgData.data[j + 2] = bytes[i];     // B from R
            imgData.data[j + 3] = 255;          // Alpha
          }
          
          ctx.putImageData(imgData, 0, 0);
        }
      } catch (e) {
        console.error("Video stream error:", e);
      }
    };

    ws.onerror = (e) => console.error("Video WebSocket error:", e);
    ws.onclose = () => console.log("Video WebSocket closed");

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId, calibrationStep]);

  // NEW: GPS WebSocket with 1-second timeout
  useEffect(() => {
    if (!projectId || (calibrationStep !== "complete" && calibrationStep !== "idle")) return;

    const connectGPS = () => {
      // Connect directly to rosbridge (not through backend)
      const gpsUrl = `ws://${import.meta.env.VITE_ROSBRIDGE_HOST || "localhost"}:${import.meta.env.VITE_ROSBRIDGE_PORT || "9091"}`;
      
      console.log("Connecting to GPS WebSocket:", gpsUrl);
      const ws = new WebSocket(gpsUrl);
      gpsWsRef.current = ws;

      ws.onopen = () => {
        console.log("✅ GPS WebSocket connected");
        // Subscribe to GPS topic
        const subscribeMsg = {
          op: "subscribe",
          topic: "/camera/gps",
          type: "sensor_msgs/msg/NavSatFix",
          queue_length: 1,
        };
        ws.send(JSON.stringify(subscribeMsg));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.topic === "/camera/gps" && msg.msg) {
            const { latitude, longitude, altitude } = msg.msg;
            
            // Clear existing timeout
            if (gpsTimeoutRef.current) {
              clearTimeout(gpsTimeoutRef.current);
            }

            // Update GPS status
            setGpsStatus({
              hasSignal: true,
              lastUpdate: Date.now(),
              lat: latitude,
              lon: longitude,
              alt: altitude,
            });

            // Update drone position on map
            setDronePosition({ lat: latitude, lng: longitude });
            
            // Add to path if recording
            if (isRecording) {
              setDronePath((prev) => [...prev, { lat: latitude, lng: longitude }]);
            }

            // Set timeout for signal loss (1 second)
            gpsTimeoutRef.current = setTimeout(() => {
              setGpsStatus((prev) => ({ ...prev, hasSignal: false }));
            }, 1000);
          }
        } catch (e) {
          console.error("GPS message error:", e);
        }
      };

      ws.onerror = (e) => {
        console.error("GPS WebSocket error:", e);
        setTimeout(connectGPS, 3000);
      };

      ws.onclose = () => {
        console.log("GPS WebSocket closed, retrying...");
        setGpsStatus((prev) => ({ ...prev, hasSignal: false }));
        setTimeout(connectGPS, 3000);
      };
    };

    connectGPS();

    return () => {
      if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
      if (gpsWsRef.current) {
        gpsWsRef.current.close();
        gpsWsRef.current = null;
      }
    };
  }, [projectId, calibrationStep, isRecording]);

  const startRecording = useCallback(async () => {
    try {
      // Restart all components instead of just starting
      await controlTerraSLAMComponent("all", "restart", projectId);
    } catch (err) {
      console.error("Failed to restart TerraSLAM:", err);
    }

    setIsRecording(true);
    setTelemetry((prev) => ({ ...prev, status: "recording" }));
    
    // Start path from current GPS position if available
    if (gpsStatus.lat && gpsStatus.lon) {
      setDronePath([{ lat: gpsStatus.lat, lng: gpsStatus.lon }]);
    }
  }, [gpsStatus]);

  const stopRecording = useCallback(async () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    try {
      await controlTerraSLAMComponent("all", "stop", projectId);
    } catch (err) {
      console.error("Failed to stop TerraSLAM:", err);
    }

    setIsRecording(false);
    setTelemetry((prev) => ({ ...prev, status: "idle" }));
  }, []);

  const handleCalibrate = useCallback(() => {
    setCalibrationStep("instructions");
  }, []);

  const handleInstructionsNext = useCallback(() => {
    setCalibrationStep("test-run");
  }, []);

  const handleTestRunSuccess = useCallback(() => {
    setCalibrationStep("upload");
  }, []);

  const handleTestRunBack = useCallback(() => {
    setCalibrationStep("instructions");
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
        setTelemetry((prev) => ({ ...prev, status: "active" }));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Ошибка сохранения точек");
      }
    },
    [projectId, uploadedImage, refetch]
  );

  const handleCalibrationCancel = useCallback(() => {
    setCalibrationStep(project?.calibrationStatus === "calibrated" ? "complete" : "idle");
    setUploadedImage(null);
  }, [project?.calibrationStatus]);

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
    handleTestRunSuccess,
    handleTestRunBack,
    handleImageUpload,
    handleCalibrationComplete,
    handleCalibrationCancel,
    clearUploadError,
    refetch,
    gpsStatus, // NEW: Export GPS status
    systemStatus, // NEW: Export system status from TerraSLAM
  };
}
