/**
 * Turns a link a person pastes in (from Google Drive, Dropbox, etc.) into a
 * direct, hotlink-able image URL where possible. Used both when saving a
 * single product's photo and when bulk-importing an "Image URL" column.
 *
 * Unrecognised links are returned unchanged — most direct image links
 * (ending in .jpg/.png/.webp, or from sites like imgur's i.imgur.com,
 * Fillout's images.fillout.com, Cloudinary, ImgBB, etc.) already work as-is.
 */
export function normalizeImageUrl(raw: string): string {
  const url = (raw || '').trim();
  if (!url) return url;

  // Google Drive "share" links -> direct-view link
  // e.g. https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveFileMatch) {
    return `https://drive.google.com/uc?export=view&id=${driveFileMatch[1]}`;
  }
  // e.g. https://drive.google.com/open?id=FILE_ID
  const driveOpenMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (driveOpenMatch) {
    return `https://drive.google.com/uc?export=view&id=${driveOpenMatch[1]}`;
  }

  // Dropbox share links -> raw content (works as a direct <img> source)
  if (url.includes('dropbox.com')) {
    if (url.includes('dl=0')) return url.replace('dl=0', 'raw=1');
    if (!url.includes('raw=1') && !url.includes('dl=1')) {
      return url + (url.includes('?') ? '&raw=1' : '?raw=1');
    }
  }

  return url;
}

/** A quick, non-exhaustive check for whether a link looks like a direct image address. */
export function isDirectImageUrl(url: string): boolean {
  if (!url) return false;
  return (
    /\.(jpe?g|png|gif|webp|avif|bmp)(\?.*)?$/i.test(url) ||
    url.includes('drive.google.com/uc') ||
    url.includes('i.imgur.com') ||
    url.includes('raw=1') ||
    url.includes('dl=1') ||
    url.includes('images.fillout.com') ||
    url.includes('res.cloudinary.com') ||
    url.includes('ibb.co') ||
    url.includes('i.ibb.co')
  );
}

/** True if the string is a plausible http(s) URL worth trying to save. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test((url || '').trim());
}
