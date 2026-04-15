import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TelemetryBar } from "@/components/TelemetryBar";
import { Button } from "@/components/ui/button";
import { getProject } from "@/lib/api";
import { useProject } from "@/hooks/useProject";
import { ProjectHeader } from "@/components/ProjectHeader";
import { CalibrationWorkflow } from "@/components/calibration/CalibrationWorkflow";
import { OperationScreen } from "@/components/operation/OperationScreen";
import { SettingsModal } from "@/components/SettingsModal";

export default function ProjectScreen() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const {
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
    gpsStatus,
    systemStatus,
  } = useProject(projectId);

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ProjectHeader 
        project={project} 
        onBack={() => navigate("/")} 
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <TelemetryBar data={telemetry} />

      {calibrationStep === "idle" || calibrationStep === "complete" ? (
        <OperationScreen
          isRecording={isRecording}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          dronePosition={dronePosition}
          dronePath={dronePath}
          showCalibration={showCalibration}
          onCalibrate={handleCalibrate}
          hasVideoStream={hasVideoStream}
          videoCanvasRef={videoCanvasRef}
          gpsStatus={gpsStatus}
          projectType={project?.type}
          systemStatus={systemStatus}
        />
      ) : (
        <CalibrationWorkflow
          step={calibrationStep}
          uploadedImage={uploadedImage}
          uploadError={uploadError}
          isUploading={isUploading}
          onInstructionsNext={handleInstructionsNext}
          onImageUpload={handleImageUpload}
          onCalibrationComplete={handleCalibrationComplete}
          onCalibrationCancel={handleCalibrationCancel}
          onUploadErrorDismiss={clearUploadError}
          projectId={projectId}
        />
      )}

      <SettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </div>
  );
}
