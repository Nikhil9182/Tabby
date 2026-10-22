import React, { useRef, useState } from "react";
import { Upload, X, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const PRESET_TRIP_IMAGES = [
  {
    id: "beach",
    label: "Beach",
    url: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "mountains",
    label: "Mountains",
    url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "city",
    label: "City",
    url: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "roadtrip",
    label: "Road trip",
    url: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "food",
    label: "Dinner",
    url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "cabin",
    label: "Home",
    url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "camping",
    label: "Camping",
    url: "https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "flight",
    label: "Flights",
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

  const isPreset = PRESET_TRIP_IMAGES.some((p) => p.url === value);

  return (
    <div className={cn("space-y-2.5", className)}>
      {/* Custom (uploaded / pasted) cover preview */}
      {value && !isPreset && (
        <div className="relative h-28 w-full overflow-hidden rounded-lg border border-border/60">
          <img src={value} alt="Cover preview" className="h-full w-full object-cover" />
          <Button
            type="button"
            size="icon-xs"
            variant="secondary"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 rounded-full bg-black/60 text-white hover:bg-black/80"
            title="Remove cover"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Presets: tap again to deselect */}
      <div className="grid grid-cols-4 gap-2">
        {PRESET_TRIP_IMAGES.map((preset) => {
          const isSelected = value === preset.url;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(isSelected ? "" : preset.url)}
              className={cn(
                "relative h-14 sm:h-16 overflow-hidden rounded-lg border-2 transition-colors",
                isSelected ? "border-primary" : "border-transparent hover:border-border"
              )}
              aria-pressed={isSelected}
              title={preset.label}
            >
              <img
                src={preset.url.replace("w=800", "w=240")}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-left text-[10px] font-semibold leading-none text-white">
                {preset.label}
              </span>
              {isSelected && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Upload or custom URL */}
      <div className="flex flex-wrap items-center gap-2">
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
          className="gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Upload</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowCustomUrl(!showCustomUrl)}
          className="gap-1.5 text-muted-foreground"
        >
          <Link2 className="h-3.5 w-3.5" />
          <span>{showCustomUrl ? "Cancel" : "Paste link"}</span>
        </Button>
      </div>

      {showCustomUrl && (
        <div className="flex items-center gap-2">
          <Input
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="h-9"
          />
          <Button type="button" size="sm" onClick={handleApplyCustomUrl} className="shrink-0">
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}

export default TripImagePicker;
