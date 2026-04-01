'use client';

import { useRef } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

export default function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleHexChange = (hex: string) => {
    // Accept partial input as user types
    if (/^#[0-9A-Fa-f]{0,6}$/.test(hex)) {
      if (hex.length === 7) onChange(hex);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Native color swatch — clicking opens OS color picker */}
      <div
        className="relative w-8 h-8 rounded-md border border-zinc-600 cursor-pointer shrink-0 overflow-hidden"
        style={{ backgroundColor: value }}
        onClick={() => inputRef.current?.click()}
        title={label}
      >
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </div>
      {/* Hex text input */}
      <input
        type="text"
        value={value}
        onChange={(e) => handleHexChange(e.target.value)}
        onBlur={(e) => {
          // Restore valid value if input is invalid
          if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
            e.target.value = value;
          }
        }}
        maxLength={7}
        className="w-24 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
        placeholder="#000000"
      />
    </div>
  );
}
