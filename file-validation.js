const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/webp'
]);

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function isSupportedImageFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  return IMAGE_TYPES.has(type) || IMAGE_EXTENSIONS.has(extension);
}
