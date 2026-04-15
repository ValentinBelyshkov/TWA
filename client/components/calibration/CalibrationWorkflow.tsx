import type { CalibrationStep } from "@/hooks/useProject";
import { InstructionsStep } from "./InstructionsStep";
import { ImageUploadStep } from "./ImageUploadStep";
import {
  CalibrationPointSelector,
  type CalibrationPoint,
} from "@/components/CalibrationPointSelector";

interface CalibrationWorkflowProps {
  step: CalibrationStep;
  uploadedImage: { filename: string; url: string } | null;
  uploadError: string | null;
  isUploading: boolean;
  onInstructionsNext: () => void;
  onImageUpload: (file: File) => void;
  onCalibrationComplete: (points: CalibrationPoint[]) => void;
  onCalibrationCancel: () => void;
  onUploadErrorDismiss: () => void;
  projectId?: string;
}

export function CalibrationWorkflow({
  step,
  uploadedImage,
  uploadError,
  isUploading,
  onInstructionsNext,
  onImageUpload,
  onCalibrationComplete,
  onCalibrationCancel,
  onUploadErrorDismiss,
  projectId,
}: CalibrationWorkflowProps) {
  const wrapOverlay = (content: React.ReactNode) => (
    <div className="fixed inset-0 z-[1200] bg-slate-50 flex flex-col p-4 lg:p-6 overflow-auto">
      <div className="min-h-full w-full max-w-7xl mx-auto bg-white rounded-2xl shadow-xl relative overflow-hidden flex flex-col">
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
    return wrapOverlay(<InstructionsStep onNext={onInstructionsNext} />);
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
