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
    <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-auto bg-white rounded-2xl shadow-2xl relative">
        <button
          onClick={onCalibrationCancel}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-10"
        >
          ✕
        </button>
        {content}
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
