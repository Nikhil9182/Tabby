import React, { useRef, useState } from "react";
import { Image, Upload, X, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const PRESET_TRIP_IMAGES = [
  {
    id: "beach",
    label: "Beach / Goa",
    url: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "mountains",
    label: "Mountains / Trek",
    url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "city",
    label: "City / Weekend",
    url: "https://images.unsplash.com/photo-1477959858617-67f30bc75b82?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "roadtrip",
    label: "Road Trip",
    url: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "food",
    label: "Dinner & Drinks",
    url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "cabin",
    label: "Home / Stay",
    url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "camping",
    label: "Camping",
    url: "https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "flight",
    label: "Travel / Flights",
    url: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&auto=format&fit=crop&q=80",
  },
];

interface TripImagePickerProps {
  value?: string;
  onChange: (url: string) => void;
  className?: string;
}

export function TripImagePicker({ value, onChange, className }: TripImagePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCustomUrl, setShowCustomUrl] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState("");

  // Compress and convert local uploaded image to lightweight data URL
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDimension = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.82);
          onChange(compressedDataUrl);
        }
      };
      if (typeof event.target?.result === "string") {
        img.src = event.target.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCustomUrl = () => {
    if (customUrlInput.trim()) {
      onChange(customUrlInput.trim());
      setCustomUrlInput("");
      setShowCustomUrl(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Image className="h-3.5 w-3.5 text-primary" />
          <span>Trip Cover Image</span>
        </label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            className="h-7 text-xs text-rose-500 hover:text-rose-600 gap-1 px-2"
          >
            <X className="h-3.5 w-3.5" />
            <span>Remove cover</span>
          </Button>
        )}
      </div>

      {/* Selected Cover Preview */}
      {value ? (
        <div className="relative h-40 w-full rounded-3xl overflow-hidden shadow-xs border border-border/80 group">
          <img
            src={value}
            alt="Trip cover preview"
            className="h-full w-full object-cover transition-transform group-hover:scale-105 duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-4">
            <span className="text-xs text-white font-bold flex items-center gap-1.5">
              <Check className="h-4 w-4 text-[#D4FF00]" />
              Cover photo active
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            className="absolute top-3 right-3 text-xs font-bold rounded-xl h-8 bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs border border-white/20"
          >
            Change photo
          </Button>
        </div>
      ) : null}

      {/* Preset Photo Grid */}
      <div>
        <p className="text-[11px] text-muted-foreground font-medium mb-2">
          Select a preset destination or upload your own trip photo:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {PRESET_TRIP_IMAGES.map((preset) => {
            const isSelected = value === preset.url;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange(preset.url)}
                className={cn(
                  "group relative h-20 rounded-2xl overflow-hidden border-2 text-left transition-all cursor-pointer shadow-2xs hover:-translate-y-0.5",
                  isSelected
                    ? "border-[#0055FF] ring-2 ring-[#0055FF]/30 scale-[1.02]"
                    : "border-border/60 hover:border-primary/50"
                )}
              >
                <img
                  src={preset.url}
                  alt={preset.label}
                  className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2">
                  <span className="text-[11px] font-bold text-white leading-tight">
                    {preset.label}
                  </span>
                </div>
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-[#0055FF] text-white flex items-center justify-center shadow-xs">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Upload or Custom URL Actions */}
      <div className="flex items-center gap-2 pt-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl text-xs font-bold gap-1.5 h-9"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Upload photo</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowCustomUrl(!showCustomUrl)}
          className="rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground h-9"
        >
          {showCustomUrl ? "Cancel URL" : "Paste URL..."}
        </Button>
      </div>

      {showCustomUrl && (
        <div className="flex items-center gap-2 pt-1 animate-in fade-in-50">
          <Input
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="h-9 rounded-xl text-xs bg-muted/30"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleApplyCustomUrl}
            className="h-9 px-3 rounded-xl bg-[#0055FF] text-white font-bold text-xs shrink-0"
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}

export default TripImagePicker;
