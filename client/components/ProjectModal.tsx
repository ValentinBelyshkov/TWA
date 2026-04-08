import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ProjectType = "камера" | "симуляция";

interface ProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateProject: (name: string, type: ProjectType, videoFile?: File) => void;
}

export function ProjectModal({
  open,
  onOpenChange,
  onCreateProject,
}: ProjectModalProps) {
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType | "">("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [step, setStep] = useState<"type" | "video">("type");

  const handleCreate = () => {
    if (!projectName || !projectType) return;

    if (projectType === "симуляция" && !videoFile) {
      alert("Пожалуйста, выберите видеофайл");
      return;
    }

    onCreateProject(
      projectName,
      projectType as ProjectType,
      videoFile || undefined,
    );
    handleReset();
  };

  const handleReset = () => {
    setProjectName("");
    setProjectType("");
    setVideoFile(null);
    setStep("type");
    onOpenChange(false);
  };

  const handleNext = () => {
    if (!projectName || !projectType) return;
    if (projectType === "симуляция") {
      setStep("video");
    } else {
      handleCreate();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Создать новый проект</AlertDialogTitle>
          <AlertDialogDescription>
            {step === "type"
              ? "Введите название проекта и выберите тип"
              : "Выберите видеофайл для симуляции"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === "type" ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Название проекта</Label>
              <Input
                id="project-name"
                placeholder="Например: Проект-1"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-type">Тип проекта</Label>
              <Select
                value={projectType}
                onValueChange={(value) =>
                  setProjectType(value as ProjectType | "")
                }
              >
                <SelectTrigger id="project-type">
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="камера">📷 Камера</SelectItem>
                  <SelectItem value="симуляция">🎬 Симуляция</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="video-file">Видеофайл</Label>
              <Input
                id="video-file"
                type="file"
                accept="video/*"
                onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                className="border-border"
              />
              {videoFile && (
                <p className="text-sm text-muted-foreground">
                  Выбран: {videoFile.name}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <AlertDialogCancel onClick={handleReset}>Отмена</AlertDialogCancel>
          {step === "type" ? (
            <Button
              onClick={handleNext}
              disabled={!projectName || !projectType}
            >
              {projectType === "симуляция" ? "Далее" : "Создать"}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("type")}>
                Назад
              </Button>
              <Button onClick={handleCreate} disabled={!videoFile}>
                Создать
              </Button>
            </>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
