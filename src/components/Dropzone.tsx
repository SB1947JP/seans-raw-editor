import { useCallback, useRef, useState } from 'react';

interface Props {
  onFile: (file: File) => void;
}

export function Dropzone({ onFile }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center h-full w-full cursor-pointer border-2 border-dashed rounded-lg transition-colors ${
        dragOver ? 'border-neutral-300 bg-neutral-900' : 'border-neutral-700 bg-neutral-950'
      }`}
    >
      <p className="text-neutral-300 text-lg font-medium">Drop a RW2 or DNG file</p>
      <p className="text-neutral-500 text-sm mt-1">or click to browse</p>
      <input
        ref={inputRef}
        type="file"
        accept=".rw2,.dng"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
