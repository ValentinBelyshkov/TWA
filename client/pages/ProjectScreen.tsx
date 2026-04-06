import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play, Square, Settings } from "lucide-react";
import { TelemetryBar } from "@/components/TelemetryBar";
import { MapComponent } from "@/components/MapComponent";
import {
  CalibrationPointSelector,
  CalibrationPoint,
} from "@/components/CalibrationPointSelector";
import { Button } from "@/components/ui/button";

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
  const [showPointCalibration, setShowPointCalibration] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<
    CalibrationPoint[]
  >([]);
  const [recordingComplete, setRecordingComplete] = useState(false);

  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordingComplete(false);
    setTelemetry({
      ...telemetry,
      status: "recording" as const,
    });
    setDronePath([{ lat: dronePosition.lat, lng: dronePosition.lng }]);

    // Simulate 15 second recording
    const timeout = setTimeout(() => {
      setIsRecording(false);
      setRecordingComplete(true);
      setTelemetry((prev) => ({
        ...prev,
        status: "idle" as "idle",
      }));
      // Show point calibration interface
      setShowPointCalibration(true);
    }, 15000); // 15 seconds

    // Simulate drone movement during recording
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 0.5;

      if (elapsed <= 15) {
        // Simulate drone ascending and moving
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
    setRecordingComplete(true);
    setShowPointCalibration(true);
    setTelemetry({
      ...telemetry,
      status: "idle" as "idle",
    });
  };

  const handleCalibrationComplete = (points: CalibrationPoint[]) => {
    setCalibrationPoints(points);
    setShowPointCalibration(false);
    setShowCalibration(false);
    setTelemetry({
      ...telemetry,
      status: "active" as "active",
    });
  };

  const handleCalibrationCancel = () => {
    setShowPointCalibration(false);
    setRecordingComplete(false);
  };

  const handleCalibrate = () => {
    // In a real app, this would navigate to calibration screen
    setShowCalibration(false);
    setTelemetry({
      ...telemetry,
      status: "active" as "active",
    });
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
              Проект #{projectId}
            </h1>
            <p className="text-sm text-muted-foreground">Операционный экран</p>
          </div>
        </div>
        <button className="p-2 hover:bg-muted rounded-lg transition-colors">
          <Settings className="w-6 h-6 text-foreground" />
        </button>
      </header>

      {/* Telemetry Bar */}
      <TelemetryBar data={telemetry} />

      {/* Main Content */}
      {showPointCalibration && (
        <CalibrationPointSelector
          imageUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23222'/%3E%3Ctext x='200' y='150' font-size='24' fill='%23666' text-anchor='middle' dominant-baseline='middle'%3EКадр из видео%3C/text%3E%3C/svg%3E"
          onComplete={handleCalibrationComplete}
          onCancel={handleCalibrationCancel}
        />
      )}

      {showCalibration && !recordingComplete ? (
        <CalibrationScreen onCalibrate={handleCalibrate} />
      ) : (
        <OperationScreen
          isRecording={isRecording}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          telemetry={telemetry}
          dronePosition={dronePosition}
          dronePath={dronePath}
          recordingComplete={recordingComplete}
        />
      )}
    </div>
  );
}

interface CalibrationScreenProps {
  onCalibrate: () => void;
}

function CalibrationScreen({ onCalibrate }: CalibrationScreenProps) {
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
            Перед началом работы необходимо выполнить калибровку
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-foreground mb-2">
              Нет калибровочного файла
            </h3>
            <p className="text-sm text-muted-foreground">
              Пожалуйста, создайте калибровочный файл, следуя инструкциям ниже
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white font-bold text-sm flex-shrink-0 mt-1">
                1
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  Поднимите дрон в воздух
                </p>
                <p className="text-sm text-muted-foreground">
                  Убедитесь, что дрон стабилен на высоте ~2 метра
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-white font-bold text-sm flex-shrink-0 mt-1">
                2
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  Нажмите кнопку "Начать"
                </p>
                <p className="text-sm text-muted-foreground">
                  Система запишет 15 секунд видео для анализа
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent text-white font-bold text-sm flex-shrink-0 mt-1">
                3
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  Установите контрольные точки
                </p>
                <p className="text-sm text-muted-foreground">
                  Выберите 5 точек на экране для калибровки
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onCalibrate}
          className="w-full btn-primary py-3 flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          Начать калибровку
        </button>
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
  recordingComplete?: boolean;
}

function OperationScreen({
  isRecording,
  onStartRecording,
  onStopRecording,
  dronePosition,
  dronePath,
  recordingComplete,
}: OperationScreenProps) {
  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 lg:p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-auto">
      {/* Left side - Camera Feed */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex-1 bg-black rounded-lg border-2 border-border flex items-center justify-center relative overflow-hidden min-h-[300px] lg:min-h-0">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <span className="text-6xl mb-4 block">📷</span>
              <p className="text-white/60 text-sm">Видеопоток с камеры дрона</p>
            </div>
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
          {!recordingComplete ? (
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
          ) : (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-semibold text-blue-900 mb-1">
                ✓ Запись завершена
              </p>
              <p className="text-xs text-blue-700">
                Откройте калибровку в окне по центру для установки контрольных
                точек
              </p>
            </div>
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
                  recordingComplete ? "text-amber-600" : "text-green-600"
                }`}
              >
                {recordingComplete ? "⏳ Ожидается..." : "✓ Выполнена"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Запись:</span>
              <span
                className={`font-semibold ${
                  recordingComplete ? "text-green-600" : "text-muted-foreground"
                }`}
              >
                {recordingComplete ? "✓ Готово" : "⊙ Ожидание"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
