import { useRef } from "react";
import { MapComponent } from "@/components/MapComponent";
import type { DronePosition, DronePath, TelemetryData } from "@/hooks/useProject";

interface OperationScreenProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  dronePosition: DronePosition;
  dronePath: DronePath;
  showCalibration: boolean;
  onCalibrate: () => void;
  hasVideoStream: boolean;
}

export function OperationScreen({
  isRecording,
  onStartRecording,
  onStopRecording,
  dronePosition,
  dronePath,
  showCalibration,
  onCalibrate,
  hasVideoStream,
}: OperationScreenProps) {
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
                <p className="text-white/60 text-sm">
                  Видеопоток с камеры дрона
                </p>
              </div>
            </div>
          )}

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
              <span className="text-lg">⚙️</span>
              Калибровка
            </button>
          ) : (
            <>
              {!isRecording ? (
                <button
                  onClick={onStartRecording}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
                >
                  <span className="text-lg">▶️</span>
                  Поднять и начать запись
                </button>
              ) : (
                <button
                  onClick={onStopRecording}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <span className="text-lg">⏹️</span>
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
