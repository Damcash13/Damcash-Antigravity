import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores';
import { api } from '../../lib/api';

export const AvatarUpload: React.FC = () => {
  const { user } = useUserStore();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!supabase) throw new Error('Supabase not initialized');

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 3. Update Profile in our Backend (Prisma)
      // Note: We need a backend endpoint to update the avatarUrl
      await api.auth.updateProfile({ avatarUrl: publicUrl });

      window.location.reload(); // Quick way to sync store
    } catch (error: any) {
      alert(error.message);
    } finally {
      setUploading(false);
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
    </div>
  );
};
