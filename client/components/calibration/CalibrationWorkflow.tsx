import type { CalibrationStep } from "@/hooks/useProject";
import { InstructionsStep } from "./InstructionsStep";
import { ImageUploadStep } from "./ImageUploadStep";
import { TestRunStep } from "./TestRunStep";
import {
  CalibrationPointSelector,
  type CalibrationPoint,
} from "@/components/CalibrationPointSelector";
import type { RefObject } from "react";

interface CalibrationWorkflowProps {
  step: CalibrationStep;
  uploadedImage: { filename: string; url: string } | null;
  uploadError: string | null;
  isUploading: boolean;
  onInstructionsNext: () => void;
  onTestRunSuccess: () => void;
  onTestRunBack: () => void;
  onImageUpload: (file: File) => void;
  onCalibrationComplete: (points: CalibrationPoint[]) => void;
  onCalibrationCancel: () => void;
  onUploadErrorDismiss: () => void;
  projectId?: string;
  hasVideoStream: boolean;
  videoCanvasRef: RefObject<HTMLCanvasElement | null>;
}

export function CalibrationWorkflow({
  step,
  uploadedImage,
  uploadError,
  isUploading,
  onInstructionsNext,
  onTestRunSuccess,
  onTestRunBack,
  onImageUpload,
  onCalibrationComplete,
  onCalibrationCancel,
  onUploadErrorDismiss,
  projectId,
  hasVideoStream,
  videoCanvasRef,
}: CalibrationWorkflowProps) {
  const wrapOverlay = (content: React.ReactNode) => (
    <div className="fixed inset-0 z-[1200] bg-slate-50 flex flex-col overflow-auto">
      <div className="min-h-full w-full bg-white shadow-xl relative overflow-hidden flex flex-col">
        <button
          onClick={onCalibrationCancel}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-10 p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <span className="text-xl">✕</span>
        </button>
        <div className="flex-1">
          {content}
        </div>
      </div>
    </div>
  );

  if (step === "instructions") {
    return wrapOverlay(
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <InstructionsStep onNext={() => {}} />
        </div>
        <div className="p-6 border-t bg-slate-50 flex justify-center shrink-0">
          <button
            onClick={onInstructionsNext}
            className="w-full max-w-md bg-primary text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            <span className="w-4 h-4">▶</span>
            Продолжить
          </button>
        </div>
      </div>
    );
  }

  if (step === "test-run" && projectId) {
    return wrapOverlay(
      <TestRunStep
        projectId={projectId}
        onSuccess={onTestRunSuccess}
        onBack={onTestRunBack}
        hasVideoStream={hasVideoStream}
        videoCanvasRef={videoCanvasRef}
      />
    );
  }

  if (step === "upload") {
    return wrapOverlay(
      <ImageUploadStep
        onUpload={onImageUpload}
        uploadError={uploadError}
        isUploading={isUploading}
        onErrorDismiss={onUploadErrorDismiss}
        onFileSelect={() => {}}
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
