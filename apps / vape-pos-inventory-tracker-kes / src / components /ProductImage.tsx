import { useState } from 'react';
import { Package } from 'lucide-react';

interface Props {
  src?: string | null;
  alt?: string;
  /** Size / layout classes, e.g. "w-full" or "w-10 h-10". Always renders as a square. */
  className?: string;
}

/**
 * Every product photo is shown in a square frame, cropped to fill (object-cover),
 * so all items look uniform whatever size the original photo was.
 */
export default function ProductImage({ src, alt = '', className = 'w-full' }: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`aspect-square bg-muted rounded-lg overflow-hidden flex items-center justify-center shrink-0 ${className}`}>
      {src && !failed ? (
        <img
          key={src}
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <Package className="w-1/3 h-1/3 text-muted-foreground/30" />
      )}
    </div>
  );
}

/**
 * Centre-crops an image to a square and shrinks it to a small JPEG data URL
 * (default 480x480) so every uploaded photo has the same shape and a small size.
 */
export async function compressImage(file: File, size = 480, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const out = Math.min(size, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
