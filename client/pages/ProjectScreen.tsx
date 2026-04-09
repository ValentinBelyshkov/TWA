import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play, Square, Settings, Upload, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { TelemetryBar } from "@/components/TelemetryBar";
import { MapComponent } from "@/components/MapComponent";
import {
  CalibrationPointSelector,
  CalibrationPoint,
} from "@/components/CalibrationPointSelector";
import { Button } from "@/components/ui/button";
import {
  getProject,
  type Project,
  uploadCalibrationImage,
  saveGCPPoints,
} from "@/lib/api";

type CalibrationStep = "instructions" | "upload" | "pairing" | "complete";

export default function ProjectScreen() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);

  const [dronePosition, setDronePosition] = useState({
    lat: 55.7558,
    lng: 37.6173,
  });
  const [dronePath, setDronePath] = useState<
    Array<{ lat: number; lng: number }>
  >([]);
  const [telemetry, setTelemetry] = useState({
    height: 0,
    speed: 0,
    battery: 100,
    status: "idle" as "idle" | "recording" | "active",
  });
  const [showCalibration, setShowCalibration] = useState(true);
  const [calibrationStep, setCalibrationStep] =
    useState<CalibrationStep>("instructions");
  const [uploadedImage, setUploadedImage] = useState<{
    filename: string;
    url: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [hasVideoStream, setHasVideoStream] = useState(false);

  // Connect to ROS video stream WebSocket
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
        project.calibrationStatus === "calibrated"
          ? "complete"
          : "instructions",
      );
    }
  }, [project]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка проекта...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Проект не найден
          </h2>
          <p className="text-muted-foreground mb-6">
            Не удалось загрузить данные проекта
          </p>
          <Button onClick={() => navigate("/")} className="btn-primary">
            Вернуться к списку проектов
          </Button>
        </div>
      </div>
    );
  }

  const handleStartRecording = () => {
    setIsRecording(true);
    setTelemetry({
      ...telemetry,
      status: "recording" as const,
    });
    setDronePath([{ lat: dronePosition.lat, lng: dronePosition.lng }]);

    // Simulate 15 second recording
    const timeout = setTimeout(() => {
      setIsRecording(false);
      setTelemetry((prev) => ({
        ...prev,
        status: "idle" as "idle",
      }));
    }, 15000);

    // Simulate drone movement during recording
    let elapsed = 0;
    const interval = setInterval(() => {
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
        clearInterval(interval);
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    setTelemetry({
      ...telemetry,
      status: "idle" as "idle",
    });
  };

  const handleCalibrate = () => {
    if (project.calibrationStatus === "calibrated") {
      setCalibrationStep("complete");
    } else {
      setCalibrationStep("instructions");
    }
    setShowCalibration(false);
  };

  // Calibration workflow handlers
  const handleInstructionsNext = () => {
    setCalibrationStep("upload");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
        err instanceof Error ? err.message : "Ошибка загрузки изображения",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleCalibrationComplete = async (points: CalibrationPoint[]) => {
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
        })),
      );
      await refetch();
      setCalibrationStep("complete");
      setShowCalibration(false);
      setTelemetry({
        ...telemetry,
        status: "active" as "active",
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка сохранения точек");
    }
  };

  const handleCalibrationCancel = () => {
    setShowCalibration(true);
    setCalibrationStep("instructions");
    setUploadedImage(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Назад"
          >
            <ArrowLeft className="w-6 h-6 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {project.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {project.type === "камера" ? "Камера" : "Симуляция"}
              {project.calibrationStatus === "calibrated" && (
                <span className="ml-2 text-green-600">✓ Откалибровано</span>
              )}
            </p>
          </div>
        </div>
        <button className="p-2 hover:bg-muted rounded-lg transition-colors">
          <Settings className="w-6 h-6 text-foreground" />
        </button>
      </header>

      {/* Telemetry Bar */}
      <TelemetryBar data={telemetry} />

      {/* Main Content */}
      {calibrationStep !== "complete" && (
        <CalibrationWorkflow
          step={calibrationStep}
          uploadedImage={uploadedImage}
          uploadError={uploadError}
          isUploading={isUploading}
          onInstructionsNext={handleInstructionsNext}
          onImageUpload={handleImageUpload}
          onCalibrationComplete={handleCalibrationComplete}
          onCalibrationCancel={handleCalibrationCancel}
          onUploadErrorDismiss={() => setUploadError(null)}
          fileInputRef={fileInputRef}
          projectId={projectId || undefined}
        />
      )}

      {calibrationStep === "complete" && (
        <OperationScreen
          isRecording={isRecording}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          telemetry={telemetry}
          dronePosition={dronePosition}
          dronePath={dronePath}
          showCalibration={showCalibration}
          onCalibrate={handleCalibrate}
          hasVideoStream={hasVideoStream}
        />
      )}
    </div>
  );
}

interface CalibrationWorkflowProps {
  step: CalibrationStep;
  uploadedImage: { filename: string; url: string } | null;
  uploadError: string | null;
  isUploading: boolean;
  onInstructionsNext: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCalibrationComplete: (points: CalibrationPoint[]) => void;
  onCalibrationCancel: () => void;
  onUploadErrorDismiss: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  projectId?: string;
}

function CalibrationWorkflow({
  step,
  uploadedImage,
  uploadError,
  isUploading,
  onInstructionsNext,
  onImageUpload,
  onCalibrationComplete,
  onCalibrationCancel,
  onUploadErrorDismiss,
  fileInputRef,
  projectId,
}: CalibrationWorkflowProps) {
  if (step === "instructions") {
    return <InstructionsStep onNext={onInstructionsNext} />;
  }

  if (step === "upload") {
    return (
      <ImageUploadStep
        onUpload={onImageUpload}
        uploadError={uploadError}
        isUploading={isUploading}
        onErrorDismiss={onUploadErrorDismiss}
        fileInputRef={fileInputRef}
      />
    );
  }

  if (step === "pairing" && uploadedImage) {
    return (
      <CalibrationPointSelector
        imageUrl={uploadedImage.url}
        onComplete={onCalibrationComplete}
        onCancel={onCalibrationCancel}
        projectId={projectId}
        imageFilename={uploadedImage.filename}
      />
    );
  }

  return null;
}

function InstructionsStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="bg-white rounded-2xl border border-border shadow-lg p-12 max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🔧</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Калибровка системы
          </h2>
          <p className="text-muted-foreground">
            Процесс калибровки состоит из нескольких этапов
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-foreground mb-2">
              Создание калибровочного файла
            </h3>
            <p className="text-sm text-muted-foreground">
              Следуйте инструкциям ниже для создания файла привязки координат
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white font-bold text-sm flex-shrink-0 mt-1">
                1
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  Ознакомьтесь с инструкцией
                </p>
                <p className="text-sm text-muted-foreground">
                  Понять процесс выбора контрольных точек
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-white font-bold text-sm flex-shrink-0 mt-1">
                2
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  Загрузите изображение
                </p>
                <p className="text-sm text-muted-foreground">
                  Выберите снимок с дрона для калибровки
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent text-white font-bold text-sm flex-shrink-0 mt-1">
                3
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  Установите 5 контрольных точек
                </p>
                <p className="text-sm text-muted-foreground">
                  Сначала кликните на изображении, затем на карте
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 text-white font-bold text-sm flex-shrink-0 mt-1">
                4
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  Сохраните GCP файл
                </p>
                <p className="text-sm text-muted-foreground">
                  Файл будет сохранён в папку проекта с заголовком +proj=utm
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onNext}
          className="w-full btn-primary py-3 flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          Продолжить
        </button>
      </div>
    </div>
  );
}

interface ImageUploadStepProps {
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadError: string | null;
  isUploading: boolean;
  onErrorDismiss: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

function ImageUploadStep({
  onUpload,
  uploadError,
  isUploading,
  onErrorDismiss,
  fileInputRef,
}: ImageUploadStepProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="bg-white rounded-2xl border border-border shadow-lg p-12 max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">📷</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Загрузка изображения
          </h2>
          <p className="text-muted-foreground">
            Выберите изображение с дрона для калибровки
          </p>
        </div>

        {uploadError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{uploadError}</p>
            <button
              onClick={onErrorDismiss}
              className="text-xs text-red-500 underline mt-2"
            >
              Закрыть
            </button>
          </div>
        )}

        <div className="space-y-6">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary hover:bg-blue-50/50 transition-all"
          >
            {isUploading ? (
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                <p className="text-muted-foreground">Загрузка...</p>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="font-semibold text-foreground mb-2">
                  Нажмите для выбора файла
                </p>
                <p className="text-sm text-muted-foreground">
                  Поддерживаются форматы: JPG, PNG
                </p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            onChange={onUpload}
            className="hidden"
            disabled={isUploading}
          />
        </div>
      </div>
    </div>
  );
}

interface OperationScreenProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  telemetry: {
    height: number;
    speed: number;
    battery: number;
    status: "idle" | "recording" | "active";
  };
  dronePosition: {
    lat: number;
    lng: number;
  };
  dronePath: Array<{ lat: number; lng: number }>;
  showCalibration: boolean;
  onCalibrate: () => void;
  hasVideoStream: boolean;
}

function OperationScreen({
  isRecording,
  onStartRecording,
  onStopRecording,
  dronePosition,
  dronePath,
  showCalibration,
  onCalibrate,
  hasVideoStream,
}: OperationScreenProps) {
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 lg:p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-auto">
      {/* Left side - Camera Feed */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex-1 bg-black rounded-lg border-2 border-border flex items-center justify-center relative overflow-hidden min-h-[300px] lg:min-h-0">
          {hasVideoStream ? (
            <canvas
              ref={videoCanvasRef}
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <span className="text-6xl mb-4 block">📷</span>
                <p className="text-white/60 text-sm">Видеопоток с камеры дрона</p>
              </div>
            </div>
          )}
          </div>

          {isRecording && (
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-500 text-white px-3 py-1 rounded-full animate-pulse">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              <span className="font-semibold text-sm">Запись</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap flex-col">
          {showCalibration ? (
            <button
              onClick={onCalibrate}
              className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Калибровка
            </button>
          ) : (
            <>
              {!isRecording ? (
                <button
                  onClick={onStartRecording}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Поднять и начать запись
                </button>
              ) : (
                <button
                  onClick={onStopRecording}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Остановить запись
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right side - Map and Info */}
      <div className="w-full lg:w-[45%] flex flex-col gap-4">
        {/* Map */}
        <div className="flex-1 bg-white rounded-lg border-2 border-border relative overflow-hidden min-h-[300px] lg:min-h-0">
          <MapComponent dronePosition={dronePosition} path={dronePath} />
        </div>

        {/* Status Panel */}
        <div className="bg-white rounded-lg border border-border p-4">
          <h3 className="font-bold text-foreground mb-3">Информация</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Статус системы:</span>
              <span className="font-semibold text-green-600">✓ Готов</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Калибровка:</span>
              <span
                className={`font-semibold ${
                  showCalibration ? "text-amber-600" : "text-green-600"
                }`}
              >
                {showCalibration ? "⏳ Требуется" : "✓ Выполнена"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Запись:</span>
              <span
                className={`font-semibold ${
                  isRecording ? "text-red-600" : "text-muted-foreground"
                }`}
              >
                {isRecording ? "● Запись" : "⊙ Ожидание"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
