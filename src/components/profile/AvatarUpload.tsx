import React, { useState } from 'react';
import { useNotificationStore, useUserStore } from '../../stores';
import { api } from '../../lib/api';

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const AVATAR_OUTPUT_SIZE = 512;
const AVATAR_OUTPUT_TYPE = 'image/jpeg';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not prepare the selected image.'));
    image.src = src;
  });
}

async function prepareAvatar(file: File) {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the selected image.');

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const cropSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = Math.max(0, (sourceWidth - cropSize) / 2);
  const sourceY = Math.max(0, (sourceHeight - cropSize) / 2);

  context.fillStyle = '#10101a';
  context.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );

  return {
    base64: canvas.toDataURL(AVATAR_OUTPUT_TYPE, 0.86),
    contentType: AVATAR_OUTPUT_TYPE,
    fileName: file.name.replace(/\.[^.]+$/, '') || 'avatar',
  };
}

export const AvatarUpload: React.FC = () => {
  const { user, updateProfile } = useUserStore();
  const addNotification = useNotificationStore(s => s.addNotification);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    try {
      setUploading(true);
      setFeedback(null);
      if (!user) throw new Error('Please sign in before changing your profile photo.');

      if (!input.files || input.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = input.files[0];
      if (!file.type.startsWith('image/')) {
        throw new Error('Please choose an image file.');
      }
      if (file.size > MAX_AVATAR_BYTES) {
        throw new Error('Profile photos must be 3 MB or smaller.');
      }

      const avatar = await prepareAvatar(file);
      const { avatarUrl } = await api.auth.uploadAvatar(avatar);

      await updateProfile({ avatarUrl });
      setFeedback('Profile photo updated.');
      addNotification('Profile photo updated.', 'success');
    } catch (error: any) {
      const message = error?.message || 'Could not update profile photo.';
      setFeedback(message);
      addNotification(message, 'error');
    } finally {
      setUploading(false);
      input.value = '';
    }
  };

  return (
    <div className="avatar-upload">
      <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
        {uploading ? 'Uploading...' : 'Change Avatar'}
        <input
          style={{ display: 'none' }}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={uploading}
        />
      </label>
      {feedback && (
        <div style={{ marginTop: 8, color: feedback.includes('updated') ? '#7bd99a' : '#f07178', fontSize: 13 }}>
          {feedback}
        </div>
      )}
    </div>
  );
};
