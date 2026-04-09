import { useState, useRef } from "react";
import { Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MapComponent } from "@/components/MapComponent";
import { saveGCPPoints, type CalibrationPointRequest } from "@/lib/api";

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
  projectId?: string;
  imageFilename?: string;
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
  projectId,
  imageFilename,
}: CalibrationPointSelectorProps) {
  const [completedPoints, setCompletedPoints] = useState<CalibrationPoint[]>(
    [],
  );
  const [pendingPoint, setPendingPoint] = useState<PendingPoint | null>(null);
  const [currentMode, setCurrentMode] = useState<"image" | "map" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isImageHovered, setIsImageHovered] = useState(false);
  const [isMapHovered, setIsMapHovered] = useState(false);

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
    if (completedPoints.length >= REQUIRED_POINTS) return;

    // If we already have image coordinates and are waiting for map, don't allow new image clicks
    if (pendingPoint?.imageX && currentMode === "map") return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Start a new point with image coordinates and set mode to map
    setCurrentMode("map");
    setPendingPoint({
      id: `point-${Date.now()}`,
      imageX: x,
      imageY: y,
    });
  };

  const handleMapPoint = (lat: number, lng: number) => {
    if (!pendingPoint || currentMode !== "map") return;

    setPendingPoint((prev) => {
      if (!prev) return null;
      return { ...prev, lat, lng };
    });
  };

  const handleMapClick = (lat: number, lng: number) => {
    handleMapPoint(lat, lng);
  };

  const completePoint = (altitude: number = 0) => {
    if (
      !pendingPoint ||
      !pendingPoint.imageX ||
      !pendingPoint.imageY ||
      !pendingPoint.lat ||
      !pendingPoint.lng
    ) {
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

  const handleSaveGCP = async () => {
    if (completedPoints.length !== REQUIRED_POINTS) {
      alert(`Пожалуйста, установите все ${REQUIRED_POINTS} контрольных точек`);
      return;
    }

    // If we have projectId and imageFilename, save to backend
    if (projectId && imageFilename) {
      setIsSaving(true);
      setSaveError(null);

      try {
        const points: CalibrationPointRequest[] = completedPoints.map((p) => ({
          imageX: p.imageX,
          imageY: p.imageY,
          lat: p.lat,
          lng: p.lng,
          altitude: p.altitude,
        }));

        await saveGCPPoints(projectId, imageFilename, points);
        onComplete(completedPoints);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Ошибка сохранения");
        setIsSaving(false);
      }
    } else {
      // Fallback to local download if no projectId
      const gpcContent = generateGPCContent(completedPoints);

      const element = document.createElement("a");
      element.setAttribute(
        "href",
        "data:text/plain;charset=utf-8," + encodeURIComponent(gpcContent),
      );
      element.setAttribute("download", "calibration.gpc");
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);

      onComplete(completedPoints);
    }
  };

  const generateGPCContent = (
    calibrationPoints: CalibrationPoint[],
  ): string => {
    let content = "+proj=utm +zone=37 +datum=WGS84\n";
    content += "image.jpg\n";
    content += `${calibrationPoints.length}\n`;

    calibrationPoints.forEach((point) => {
      content += `${point.imageX.toFixed(6)} ${point.imageY.toFixed(6)} ${point.lng.toFixed(6)} ${point.lat.toFixed(6)} ${point.altitude.toFixed(2)}\n`;
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
              onMouseEnter={() => setIsImageHovered(true)}
              onMouseLeave={() => setIsImageHovered(false)}
              className={`relative flex-1 rounded-lg overflow-hidden border-2 transition-all min-h-[300px] cursor-pointer hover:border-primary/50 ${
                currentMode === "image"
                  ? "border-primary cursor-crosshair bg-blue-50"
                  : "border-border bg-gray-100"
              }`}
            >
              <img
                src={imageUrl}
                alt="Calibration"
                className="w-full h-full object-contain pointer-events-none"
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
                        <p className="font-bold text-green-900">
                          Точка {idx + 1}
                        </p>
                        <p className="text-green-700">
                          Пиксели: ({point.imageX.toFixed(0)},{" "}
                          {point.imageY.toFixed(0)})
                        </p>
                        <p className="text-green-600">
                          Координаты: ({point.lat.toFixed(4)},{" "}
                          {point.lng.toFixed(4)})
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
              onMouseEnter={() => setIsMapHovered(true)}
              onMouseLeave={() => setIsMapHovered(false)}
              className={`relative flex-1 rounded-lg overflow-hidden border-2 transition-all min-h-[300px] ${
                currentMode === "map" ? "border-primary" : "border-border"
              }`}
            >
              <MapComponent
                dronePosition={{ lat: 55.7558, lng: 37.6173 }}
                path={completedPoints.map((p) => ({
                  lat: p.lat,
                  lng: p.lng,
                }))}
                onMapClick={
                  currentMode === "map" && pendingPoint
                    ? handleMapClick
                    : undefined
                }
                selectedPoint={
                  pendingPoint?.lat && pendingPoint?.lng
                    ? { lat: pendingPoint.lat, lng: pendingPoint.lng }
                    : undefined
                }
              />
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
                        "altitude-input",
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
          {saveError && (
            <div className="flex-1 max-w-xs">
              <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                {saveError}
              </p>
            </div>
          )}
          <Button
            onClick={onCancel}
            className="px-6 py-2 border border-border rounded-lg font-semibold hover:bg-muted transition-colors"
            disabled={isSaving}
          >
            Отмена
          </Button>
          <Button
            onClick={handleSaveGCP}
            disabled={completedPoints.length !== REQUIRED_POINTS || isSaving}
            className={`gap-2 flex items-center ${
              completedPoints.length !== REQUIRED_POINTS || isSaving
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "btn-primary"
            }`}
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Сохранение...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Сохранить GCP файл
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
