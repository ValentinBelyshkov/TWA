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

export function CalibrationPointSelector({
  imageUrl,
  onComplete,
  onCancel,
}: CalibrationPointSelectorProps) {
  const [points, setPoints] = useState<CalibrationPoint[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState<"image" | "map">("image");
  const imageRef = useRef<HTMLImageElement | null>(null);

  const REQUIRED_POINTS = 5;

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editingMode !== "image") return;
    if (points.length >= REQUIRED_POINTS) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newPoint: CalibrationPoint = {
      id: `point-${Date.now()}`,
      imageX: x,
      imageY: y,
      lat: 55.7558 + (Math.random() - 0.5) * 0.01,
      lng: 37.6173 + (Math.random() - 0.5) * 0.01,
      altitude: 0,
    };

    setPoints([...points, newPoint]);
    setSelectedPointId(newPoint.id);
  };

  const handleMapPointClick = (point: CalibrationPoint) => {
    if (editingMode !== "map") return;
    setSelectedPointId(point.id);
  };

  const updatePointCoordinates = (
    id: string,
    lat: number,
    lng: number,
    altitude: number
  ) => {
    setPoints(
      points.map((p) => (p.id === id ? { ...p, lat, lng, altitude } : p))
    );
  };

  const deletePoint = (id: string) => {
    setPoints(points.filter((p) => p.id !== id));
    if (selectedPointId === id) {
      setSelectedPointId(null);
    }
  };

  const generateGPCFile = () => {
    if (points.length !== REQUIRED_POINTS) {
      alert(`Пожалуйста, установите все ${REQUIRED_POINTS} контрольных точек`);
      return;
    }

    // Generate GPC file content
    const gpcContent = generateGPCContent(points);

    // Create and download file
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

    onComplete(points);
  };

  const generateGPCContent = (calibrationPoints: CalibrationPoint[]): string => {
    let content = "image.jpg\n";
    content += `${calibrationPoints.length}\n`;

    calibrationPoints.forEach((point) => {
      content += `${point.imageX.toFixed(2)} ${point.imageY.toFixed(2)} ${point.lng.toFixed(6)} ${point.lat.toFixed(6)} ${point.altitude.toFixed(2)}\n`;
    });

    return content;
  };

  const selectedPoint = points.find((p) => p.id === selectedPointId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-auto flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-secondary text-white p-6 border-b">
          <h2 className="text-2xl font-bold mb-2">Калибровка системы</h2>
          <p className="text-white/90">
            Установите {REQUIRED_POINTS} контрольных точек на изображении и карте
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 flex gap-6 p-6 overflow-hidden">
          {/* Left: Image with points */}
          <div className="flex-1 flex flex-col">
            <div className="mb-3 flex gap-2">
              <button
                onClick={() => setEditingMode("image")}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  editingMode === "image"
                    ? "bg-primary text-white"
                    : "bg-muted text-foreground hover:bg-muted/80"
                }`}
              >
                📷 Точки на изображении
              </button>
              <p className="text-sm text-muted-foreground self-center">
                {points.length}/{REQUIRED_POINTS}
              </p>
            </div>

            <div
              ref={imageRef}
              onClick={handleImageClick}
              className="relative flex-1 rounded-lg overflow-hidden border-2 border-border cursor-crosshair bg-gray-100"
            >
              <img
                src={imageUrl}
                alt="Calibration"
                className="w-full h-full object-contain"
              />

              {/* Points on image */}
              {points.map((point) => (
                <div
                  key={point.id}
                  className={`absolute w-8 h-8 rounded-full border-2 transition-all ${
                    selectedPointId === point.id
                      ? "bg-primary border-white shadow-lg scale-125"
                      : "bg-secondary border-white"
                  }`}
                  style={{
                    left: `${point.imageX}px`,
                    top: `${point.imageY}px`,
                    transform: "translate(-50%, -50%)",
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPointId(point.id);
                    setEditingMode("map");
                  }}
                  title={`Точка ${points.indexOf(point) + 1}`}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                    {points.indexOf(point) + 1}
                  </span>
                </div>
              ))}

              {/* Instructions */}
              {points.length === 0 && editingMode === "image" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                  <div className="text-center text-white">
                    <p className="text-lg font-semibold mb-2">
                      Нажмите на изображение для добавления точек
                    </p>
                    <p className="text-sm">Требуется {REQUIRED_POINTS} точек</p>
                  </div>
                </div>
              )}
            </div>

            {/* Points list */}
            <div className="mt-3 max-h-32 overflow-y-auto">
              <p className="text-sm font-semibold text-foreground mb-2">
                Найденные точки:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {points.map((point, idx) => (
                  <div
                    key={point.id}
                    className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                      selectedPointId === point.id
                        ? "bg-primary/10 border-primary"
                        : "bg-muted border-border hover:bg-muted/80"
                    }`}
                    onClick={() => {
                      setSelectedPointId(point.id);
                      setEditingMode("map");
                    }}
                  >
                    <p className="text-xs font-bold text-foreground">
                      Точка {idx + 1}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Пиксели: ({point.imageX.toFixed(0)}, {point.imageY.toFixed(0)})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Map and point editor */}
          <div className="flex-1 flex flex-col">
            <div className="mb-3">
              <button
                onClick={() => setEditingMode("map")}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  editingMode === "map"
                    ? "bg-primary text-white"
                    : "bg-muted text-foreground hover:bg-muted/80"
                }`}
              >
                🗺️ Координаты на карте
              </button>
            </div>

            <div className="flex-1 rounded-lg overflow-hidden border-2 border-border">
              <MapComponent
                dronePosition={{
                  lat: selectedPoint?.lat ?? 55.7558,
                  lng: selectedPoint?.lng ?? 37.6173,
                }}
                path={points.map((p) => ({ lat: p.lat, lng: p.lng }))}
              />
            </div>

            {/* Point editor */}
            {selectedPoint && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-foreground">
                    Редактирование точки{" "}
                    {points.indexOf(selectedPoint) + 1}
                  </p>
                  <button
                    onClick={() => deletePoint(selectedPoint.id)}
                    className="p-1 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Широта
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={selectedPoint.lat}
                      onChange={(e) =>
                        updatePointCoordinates(
                          selectedPoint.id,
                          parseFloat(e.target.value),
                          selectedPoint.lng,
                          selectedPoint.altitude
                        )
                      }
                      className="w-full px-2 py-1 border border-border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Долгота
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      value={selectedPoint.lng}
                      onChange={(e) =>
                        updatePointCoordinates(
                          selectedPoint.id,
                          selectedPoint.lat,
                          parseFloat(e.target.value),
                          selectedPoint.altitude
                        )
                      }
                      className="w-full px-2 py-1 border border-border rounded text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Высота (м)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={selectedPoint.altitude}
                      onChange={(e) =>
                        updatePointCoordinates(
                          selectedPoint.id,
                          selectedPoint.lat,
                          selectedPoint.lng,
                          parseFloat(e.target.value)
                        )
                      }
                      className="w-full px-2 py-1 border border-border rounded text-sm"
                    />
                  </div>
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
            disabled={points.length !== REQUIRED_POINTS}
            className="btn-primary gap-2 flex items-center"
          >
            <Download className="w-4 h-4" />
            Сохранить GPC файл
          </Button>
        </div>
      </div>
    </div>
  );
}
