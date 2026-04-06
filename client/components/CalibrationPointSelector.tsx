import { useState, useRef } from "react";
import { Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MapComponent } from "@/components/MapComponent";

export interface CalibrationPoint {
  id: string;
  imageX: number;
  imageY: number;
  lat: number;
  lng: number;
  altitude: number;
}

interface CalibrationPointSelectorProps {
  imageUrl: string;
  onComplete: (points: CalibrationPoint[]) => void;
  onCancel: () => void;
}

interface PendingPoint {
  id: string;
  imageX?: number;
  imageY?: number;
  lat?: number;
  lng?: number;
}

export function CalibrationPointSelector({
  imageUrl,
  onComplete,
  onCancel,
}: CalibrationPointSelectorProps) {
  const [completedPoints, setCompletedPoints] = useState<CalibrationPoint[]>([]);
  const [pendingPoint, setPendingPoint] = useState<PendingPoint | null>(null);
  const [currentMode, setCurrentMode] = useState<"image" | "map" | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const REQUIRED_POINTS = 5;
  const pointNumber = completedPoints.length + 1;

  const startNewPoint = (mode: "image" | "map") => {
    if (completedPoints.length >= REQUIRED_POINTS) return;
    if (pendingPoint) return; // Already adding a point

    setCurrentMode(mode);
    setPendingPoint({
      id: `point-${Date.now()}`,
    });
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pendingPoint || currentMode !== "image") return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPendingPoint((prev) => {
      if (!prev) return null;
      return { ...prev, imageX: x, imageY: y };
    });

    // Switch to map mode
    setCurrentMode("map");
  };

  const handleMapPoint = (lat: number, lng: number) => {
    if (!pendingPoint || currentMode !== "map") return;

    setPendingPoint((prev) => {
      if (!prev) return null;
      return { ...prev, lat, lng };
    });
  };

  const completePoint = (altitude: number = 0) => {
    if (!pendingPoint || !pendingPoint.imageX || !pendingPoint.imageY || !pendingPoint.lat || !pendingPoint.lng) {
      alert("Требуются координаты на обеих сторонах");
      return;
    }

    const newPoint: CalibrationPoint = {
      id: pendingPoint.id,
      imageX: pendingPoint.imageX,
      imageY: pendingPoint.imageY,
      lat: pendingPoint.lat,
      lng: pendingPoint.lng,
      altitude,
    };

    setCompletedPoints([...completedPoints, newPoint]);
    setPendingPoint(null);
    setCurrentMode(null);
  };

  const cancelPoint = () => {
    setPendingPoint(null);
    setCurrentMode(null);
  };

  const deletePoint = (index: number) => {
    setCompletedPoints(completedPoints.filter((_, i) => i !== index));
  };

  const generateGPCFile = () => {
    if (completedPoints.length !== REQUIRED_POINTS) {
      alert(`Пожалуйста, установите все ${REQUIRED_POINTS} контрольных точек`);
      return;
    }

    const gpcContent = generateGPCContent(completedPoints);

    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/plain;charset=utf-8," + encodeURIComponent(gpcContent)
    );
    element.setAttribute("download", "calibration.gpc");
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    onComplete(completedPoints);
  };

  const generateGPCContent = (calibrationPoints: CalibrationPoint[]): string => {
    let content = "image.jpg\n";
    content += `${calibrationPoints.length}\n`;

    calibrationPoints.forEach((point) => {
      content += `${point.imageX.toFixed(2)} ${point.imageY.toFixed(2)} ${point.lng.toFixed(6)} ${point.lat.toFixed(6)} ${point.altitude.toFixed(2)}\n`;
    });

    return content;
  };

  const getProgressText = () => {
    if (!pendingPoint) {
      return `Точка ${pointNumber}/${REQUIRED_POINTS}`;
    }
    if (!pendingPoint.imageX) {
      return `Точка ${pointNumber}: Выберите на изображении`;
    }
    return `Точка ${pointNumber}: Выберите на карте`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-auto flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-secondary text-white p-6 border-b">
          <h2 className="text-2xl font-bold mb-2">Калибровка системы</h2>
          <p className="text-white/90">{getProgressText()}</p>
        </div>

        {/* Content */}
        <div className="flex-1 flex gap-6 p-6 overflow-hidden">
          {/* Left: Image with points */}
          <div className="flex-1 flex flex-col">
            <div className="mb-3 flex gap-2 items-center">
              <button
                onClick={() => !pendingPoint && startNewPoint("image")}
                disabled={!!pendingPoint}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  currentMode === "image"
                    ? "bg-primary text-white"
                    : pendingPoint
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                      : "bg-muted text-foreground hover:bg-muted/80"
                }`}
              >
                📷 На изображении
              </button>
              <span className="text-sm font-semibold text-foreground">
                {completedPoints.length}/{REQUIRED_POINTS}
              </span>
            </div>

            <div
              onClick={handleImageClick}
              className={`relative flex-1 rounded-lg overflow-hidden border-2 transition-all ${
                currentMode === "image"
                  ? "border-primary cursor-crosshair bg-blue-50"
                  : "border-border bg-gray-100 cursor-default"
              }`}
            >
              <img
                src={imageUrl}
                alt="Calibration"
                className="w-full h-full object-contain"
              />

              {/* Completed points on image */}
              {completedPoints.map((point, idx) => (
                <div
                  key={point.id}
                  className="absolute w-8 h-8 rounded-full border-2 border-white bg-primary shadow-lg"
                  style={{
                    left: `${point.imageX}px`,
                    top: `${point.imageY}px`,
                    transform: "translate(-50%, -50%)",
                  }}
                  title={`Точка ${idx + 1}`}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                    {idx + 1}
                  </span>
                </div>
              ))}

              {/* Pending point on image */}
              {pendingPoint?.imageX && (
                <div
                  className="absolute w-8 h-8 rounded-full border-2 border-amber-400 bg-amber-300 shadow-lg animate-pulse"
                  style={{
                    left: `${pendingPoint.imageX}px`,
                    top: `${pendingPoint.imageY}px`,
                    transform: "translate(-50%, -50%)",
                  }}
                  title={`Точка ${pointNumber} (ожидание)`}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-amber-900 text-xs font-bold">
                    {pointNumber}
                  </span>
                </div>
              )}

              {/* Instructions */}
              {currentMode === "image" && !pendingPoint?.imageX && (
                <div className="absolute inset-0 flex items-center justify-center bg-primary/20 backdrop-blur-sm">
                  <div className="text-center text-white">
                    <p className="text-lg font-semibold mb-2">
                      Нажмите на изображение
                    </p>
                    <p className="text-sm">Для установки точки {pointNumber}</p>
                  </div>
                </div>
              )}

              {currentMode !== "image" && completedPoints.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                  <div className="text-center text-white">
                    <p className="text-lg font-semibold">
                      Нажмите "На изображении" чтобы начать
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Completed points list */}
            {completedPoints.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto">
                <p className="text-sm font-semibold text-foreground mb-2">
                  Установленные точки:
                </p>
                <div className="space-y-1">
                  {completedPoints.map((point, idx) => (
                    <div
                      key={point.id}
                      className="p-2 rounded-lg bg-green-50 border border-green-200 flex justify-between items-center"
                    >
                      <div className="text-xs">
                        <p className="font-bold text-green-900">Точка {idx + 1}</p>
                        <p className="text-green-700">
                          Пиксели: ({point.imageX.toFixed(0)}, {point.imageY.toFixed(0)})
                        </p>
                        <p className="text-green-600">
                          Координаты: ({point.lat.toFixed(4)}, {point.lng.toFixed(4)})
                        </p>
                      </div>
                      <button
                        onClick={() => deletePoint(idx)}
                        className="p-1 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Map with point selector */}
          <div className="flex-1 flex flex-col">
            <div className="mb-3 flex gap-2 items-center">
              <button
                onClick={() => !pendingPoint && startNewPoint("map")}
                disabled={!!pendingPoint}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  currentMode === "map"
                    ? "bg-primary text-white"
                    : pendingPoint
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                      : "bg-muted text-foreground hover:bg-muted/80"
                }`}
              >
                🗺️ На карте
              </button>
            </div>

            <div
              className={`flex-1 rounded-lg overflow-hidden border-2 transition-all ${
                currentMode === "map" ? "border-primary" : "border-border"
              }`}
            >
              {currentMode === "map" && pendingPoint ? (
                <MapClickableComponent
                  onPointSelect={(lat, lng) => {
                    handleMapPoint(lat, lng);
                  }}
                  selectedPoint={
                    pendingPoint.lat && pendingPoint.lng
                      ? { lat: pendingPoint.lat, lng: pendingPoint.lng }
                      : undefined
                  }
                />
              ) : (
                <MapComponent
                  dronePosition={{ lat: 55.7558, lng: 37.6173 }}
                  path={completedPoints.map((p) => ({
                    lat: p.lat,
                    lng: p.lng,
                  }))}
                />
              )}
            </div>

            {/* Point editor for pending point */}
            {pendingPoint && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="mb-3">
                  <p className="font-semibold text-foreground mb-2">
                    Добавление точки {pointNumber}
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Пиксели:</span>
                      <span className="font-mono font-bold">
                        {pendingPoint.imageX
                          ? `(${pendingPoint.imageX.toFixed(0)}, ${pendingPoint.imageY?.toFixed(0)})`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Координаты:</span>
                      <span className="font-mono font-bold">
                        {pendingPoint.lat
                          ? `(${pendingPoint.lat.toFixed(4)}, ${pendingPoint.lng?.toFixed(4)})`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Высота (м)"
                    defaultValue="0"
                    id="altitude-input"
                    className="px-2 py-1 border border-border rounded text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={cancelPoint}
                    className="flex-1 px-3 py-2 border border-border rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      const altitudeInput = document.getElementById(
                        "altitude-input"
                      ) as HTMLInputElement;
                      const altitude = altitudeInput
                        ? parseFloat(altitudeInput.value)
                        : 0;
                      completePoint(altitude);
                    }}
                    disabled={!pendingPoint.imageX || !pendingPoint.lat}
                    className={`flex-1 px-3 py-2 rounded-lg font-semibold transition-colors ${
                      !pendingPoint.imageX || !pendingPoint.lat
                        ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700 text-white"
                    }`}
                  >
                    ✓ Сохранить точку {pointNumber}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-border p-6 flex gap-3 justify-end">
          <Button
            onClick={onCancel}
            className="px-6 py-2 border border-border rounded-lg font-semibold hover:bg-muted transition-colors"
          >
            Отмена
          </Button>
          <Button
            onClick={generateGPCFile}
            disabled={completedPoints.length !== REQUIRED_POINTS}
            className={`gap-2 flex items-center ${
              completedPoints.length !== REQUIRED_POINTS
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "btn-primary"
            }`}
          >
            <Download className="w-4 h-4" />
            Сохранить GPC файл
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MapClickableComponentProps {
  onPointSelect: (lat: number, lng: number) => void;
  selectedPoint?: { lat: number; lng: number };
}

function MapClickableComponent({
  onPointSelect,
  selectedPoint,
}: MapClickableComponentProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={mapRef}
      className="w-full h-full flex items-center justify-center relative bg-blue-50"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        // Convert to approximate lat/lng
        const lat = 55.7558 + (y - 0.5) * 0.02;
        const lng = 37.6173 + (x - 0.5) * 0.02;

        onPointSelect(lat, lng);
      }}
    >
      <div className="text-center pointer-events-none">
        <p className="text-primary font-bold mb-2">Нажмите на карту</p>
        <p className="text-sm text-muted-foreground">
          Для установки координат точки
        </p>
      </div>

      {selectedPoint && (
        <div className="absolute w-8 h-8 rounded-full border-2 border-amber-400 bg-amber-300 shadow-lg animate-pulse top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
      )}
    </div>
  );
}
