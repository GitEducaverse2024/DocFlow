"use client";

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  projectId: string;
  onUploadComplete: () => void;
}

export function FileUploadZone({ projectId, onUploadComplete }: FileUploadZoneProps) {
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const file of acceptedFiles) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`El archivo ${file.name} supera los 50MB`);
        errorCount++;
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(`/api/projects/${projectId}/sources`, {
          method: 'POST',
          body: formData,
        });

        if (res.status === 409) {
          // Duplicate file
          await res.json();
          if (confirm(`El archivo ${file.name} ya existe. ¿Subir de todos modos?`)) {
            formData.append('force', 'true');
            const retryRes = await fetch(`/api/projects/${projectId}/sources`, {
              method: 'POST',
              body: formData,
            });
            if (retryRes.ok) successCount++;
            else errorCount++;
          }
        } else if (res.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error('Upload error:', error);
        errorCount++;
      }
    }

    setIsUploading(false);
    
    if (successCount > 0) {
      toast.success(`${successCount} archivo(s) subido(s) correctamente`);
      onUploadComplete();
    }
    if (errorCount > 0) {
      toast.error(`Error al subir ${errorCount} archivo(s)`);
    }
  }, [projectId, onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div 
      {...getRootProps()} 
      className={cn(
        "border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all duration-200 min-h-[200px] flex flex-col items-center justify-center",
        isDragActive ? "border-violet-500 bg-violet-500/5" : "border-zinc-700 hover:border-violet-500 hover:bg-zinc-900/50",
        isUploading && "opacity-50 pointer-events-none"
      )}
    >
      <input {...getInputProps()} />
      
      {isUploading ? (
        <>
          <Loader2 className="w-12 h-12 text-violet-500 animate-spin mb-4" />
          <p className="text-zinc-300 font-medium">Subiendo archivos...</p>
        </>
      ) : (
        <>
          <div className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-transform duration-200",
            isDragActive ? "bg-violet-500/20 scale-110" : "bg-zinc-800"
          )}>
            <Upload className={cn(
              "w-8 h-8",
              isDragActive ? "text-violet-500" : "text-zinc-400"
            )} />
          </div>
          <p className="text-zinc-300 font-medium mb-2">
            {isDragActive ? "Suelta los archivos aquí" : "Arrastra archivos aquí o haz clic para seleccionar"}
          </p>
          <p className="text-zinc-500 text-sm">
            Soporta PDF, DOCX, TXT, MD, CSV, imágenes y código (Máx 50MB)
          </p>
        </>
      )}
    </div>
  );
}
