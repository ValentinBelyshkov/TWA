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
  if (step === "instructions") {
    return <InstructionsStep onNext={onInstructionsNext} />;
  }

  if (step === "upload") {
    return (
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
