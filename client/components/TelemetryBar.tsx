import { Zap, Gauge, Battery, Activity } from "lucide-react";

interface TelemetryData {
  height: number;
  speed: number;
  battery: number;
  status: "idle" | "recording" | "active";
}

interface TelemetryBarProps {
  data: TelemetryData;
}

export function TelemetryBar({ data }: TelemetryBarProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "recording":
        return "bg-red-100 text-red-700";
      case "active":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getBatteryColor = (battery: number) => {
    if (battery > 60) return "text-green-600";
    if (battery > 30) return "text-yellow-600";
    return "text-red-600";
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "recording":
        return "🔴 Запись";
      case "active":
        return "✓ Активен";
      default:
        return "⊙ Ожидание";
    }
  };

  return (
    <div className="w-full bg-white border-b border-border px-6 py-4 shadow-sm">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Height */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Zap className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Высота</p>
            <p className="text-lg font-bold text-foreground">{data.height} м</p>
          </div>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-100 rounded-lg">
            <Gauge className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Скорость</p>
            <p className="text-lg font-bold text-foreground">{data.speed} м/с</p>
          </div>
        </div>

        {/* Battery */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <Battery className={`w-5 h-5 ${getBatteryColor(data.battery)}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Батарея</p>
            <p className={`text-lg font-bold ${getBatteryColor(data.battery)}`}>
              {data.battery}%
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Activity className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Статус</p>
            <p className="text-lg font-bold text-foreground">
              {getStatusLabel(data.status)}
            </p>
          </div>
        </div>

        {/* Additional Info */}
        <div className="flex items-center gap-3 md:flex">
          <div className={`px-3 py-2 rounded-lg font-semibold text-sm ${getStatusColor(data.status)}`}>
            {data.status === "recording"
              ? "Идёт запись"
              : data.status === "active"
                ? "Готов"
                : "В режиме ожидания"}
          </div>
        </div>
      </div>
    </div>
  );
}
