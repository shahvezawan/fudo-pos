import { useEffect, useState } from 'react';
export const imageUrl = (kind: 'menu' | 'logo', id: string, version?: string) =>
  version
    ? `/api/images/${kind}/${encodeURIComponent(id)}?v=${encodeURIComponent(version)}`
    : undefined;
export async function uploadImage(kind: 'menu' | 'logo', id: string, file: File) {
  const response = await fetch(`/api/images/${kind}/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Image upload failed.');
}
export function ImagePicker({
  label,
  current,
  file,
  onChange,
}: {
  label: string;
  current?: string;
  file?: File;
  onChange: (file?: File) => void;
}) {
  const [preview, setPreview] = useState<string>(),
    [error, setError] = useState('');
  useEffect(() => {
    if (!file) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="image-picker">
      {(preview || current) && <img src={preview || current} alt={`${label} preview`} />}
      <label className="field">
        <span>{label}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            setError('');
            if (
              chosen &&
              (!['image/jpeg', 'image/png', 'image/webp'].includes(chosen.type) ||
                chosen.size > 5 * 1024 * 1024)
            ) {
              setError('Choose a JPEG, PNG, or WebP image under 5 MB.');
              e.target.value = '';
              onChange(undefined);
              return;
            }
            onChange(chosen);
          }}
        />
      </label>
      <small>
        JPEG, PNG, or WebP · up to 5 MB. Saving a new picture replaces the previous image.
      </small>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
