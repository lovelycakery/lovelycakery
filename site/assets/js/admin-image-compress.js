// Client-side image compression for Lovely Admin (replaces sharp in Electron)
// Uses Canvas API to resize and compress images to JPEG
(function () {
  'use strict';
  if (window.ImageCompress) return;

  // 桌面版：1000px, quality 0.72
  const DESKTOP_MAX = 1000;
  const DESKTOP_QUALITY = 0.72;
  // 手機版：480px, quality 0.68
  const MOBILE_MAX = 480;
  const MOBILE_QUALITY = 0.68;

  /**
   * Resize a bitmap to fit within maxDim and export as JPEG.
   */
  async function resizeAndExport(bitmap, maxDim, quality) {
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvasToBlob(canvas, quality);
    const base64 = await blobToBase64(blob);
    return { blob, base64, width: w, height: h };
  }

  /**
   * Compress an image File/Blob to two JPEG versions (desktop + mobile).
   * @param {File|Blob} file - The input image
   * @returns {Promise<{desktop: {blob, base64, width, height}, mobile: {blob, base64, width, height}}>}
   */
  async function compress(file) {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });
    const desktop = await resizeAndExport(bitmap, DESKTOP_MAX, DESKTOP_QUALITY);
    const mobile = await resizeAndExport(bitmap, MOBILE_MAX, MOBILE_QUALITY);
    bitmap.close();
    return { desktop, mobile };
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
