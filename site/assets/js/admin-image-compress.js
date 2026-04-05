// Client-side image compression for Lovely Admin (replaces sharp in Electron)
// Uses Canvas API to resize and compress images to JPEG
(function () {
  'use strict';
  if (window.ImageCompress) return;

  const MAX_DIMENSION = 2000;
  const QUALITY_HIGH = 0.85;
  const QUALITY_LOW = 0.75;
  const SIZE_THRESHOLD = 500 * 1024; // 500 KB

  /**
   * Compress an image File/Blob to JPEG.
   * @param {File|Blob} file - The input image
   * @returns {Promise<{blob: Blob, base64: string, width: number, height: number}>}
   */
  async function compress(file) {
    // Load image as bitmap (handles EXIF orientation automatically)
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });

    let w = bitmap.width;
    let h = bitmap.height;

    // Resize if exceeding max dimension
    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    // Draw to canvas
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    // First pass: high quality
    let blob = await canvasToBlob(canvas, QUALITY_HIGH);

    // If still too large, try lower quality
    if (blob.size > SIZE_THRESHOLD) {
      blob = await canvasToBlob(canvas, QUALITY_LOW);
    }

    // Convert to base64 (without data URI prefix)
    const base64 = await blobToBase64(blob);

    return { blob, base64, width: w, height: h };
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/jpeg',
        quality
      );
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Remove "data:image/jpeg;base64," prefix
        const result = reader.result;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  }

  window.ImageCompress = { compress };
})();
