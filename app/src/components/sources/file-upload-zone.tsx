"use client";

import { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FolderUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileUploadZoneProps {
  projectId: string;
  onUploadComplete: () => void;
}

export function FileUploadZone({ projectId, onUploadComplete }: FileUploadZoneProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const folderInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;

    // Filter hidden files and directories
    const validFiles = files.filter(file => {
      const path = file.webkitRelativePath || file.name;
      return !path.includes('/.') && 
             !path.startsWith('.') && 
             !path.includes('node_modules/') && 
             !path.includes('__pycache__/');
    });

    if (validFiles.length === 0) {
      toast.error('No se encontraron archivos válidos para subir');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: validFiles.length });
    
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setUploadProgress({ current: i + 1, total: validFiles.length });

      if (file.size > 50 * 1024 * 1024) {
        toast.error(`El archivo ${file.name} supera los 50MB`);
        errorCount++;
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);
      
      // Preserve relative path if available
      if (file.webkitRelativePath) {
        formData.append('relativePath', file.webkitRelativePath);
      } else {
        formData.append('relativePath', file.name);
      }

      try {
        const res = await fetch(`/api/catbrains/${projectId}/sources`, {
          method: 'POST',
          body: formData,
        });

        if (res.status === 409) {
          // Duplicate file
          await res.json();
          if (confirm(`El archivo ${file.name} ya existe. ¿Subir de todos modos?`)) {
            formData.append('force', 'true');
            const retryRes = await fetch(`/api/catbrains/${projectId}/sources`, {
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
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    processFiles(acceptedFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, onUploadComplete]);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
    // Reset input so the same folder can be selected again
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div className="space-y-4">
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
            <p className="text-zinc-300 font-medium mb-2">Subiendo archivos...</p>
            <p className="text-zinc-400 text-sm">
              {uploadProgress.current} / {uploadProgress.total}
            </p>
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

      {!isUploading && (
        <div className="flex justify-center">
          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFolderSelect}
            className="hidden"
            // @ts-expect-error - webkitdirectory is not in standard React types but works in browsers
            webkitdirectory=""
            directory=""
          />
          <Button 
            variant="outline" 
            onClick={() => folderInputRef.current?.click()}
            className="bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
          >
            <FolderUp className="w-4 h-4 mr-2" />
            Subir carpeta
          </Button>
        </div>
      )}
    </div>
  );
}
