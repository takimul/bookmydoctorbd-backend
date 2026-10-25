import { v2 as cloudinary } from 'cloudinary';
import { ENV } from './env';
import fs from 'fs';
import path from 'path';

const isCloudinaryConfigured = Boolean(
  ENV.CLOUDINARY_CLOUD_NAME &&
  ENV.CLOUDINARY_API_KEY &&
  ENV.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
    api_key: ENV.CLOUDINARY_API_KEY,
    api_secret: ENV.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const uploadMediaFile = async (
  input: string | Buffer,
  options: {
    folder?: string;
    filenamePrefix?: string;
    mimeType?: string;
    resourceType?: 'image' | 'raw' | 'auto';
  } = {}
): Promise<{ url: string; publicId?: string }> => {
  const { folder = 'bookmydoctorbd', filenamePrefix = 'doc', mimeType = 'image/jpeg', resourceType = 'auto' } = options;

  // 1. If it's already an HTTP / HTTPS URL, just return it
  if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
    return { url: input };
  }

  // 2. Try Cloudinary if configured
  if (isCloudinaryConfigured) {
    try {
      if (typeof input === 'string') {
        const uploadResult = await cloudinary.uploader.upload(input, {
          folder,
          resource_type: resourceType,
        });
        return { url: uploadResult.secure_url, publicId: uploadResult.public_id };
      } else if (Buffer.isBuffer(input)) {
        return new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder, resource_type: resourceType },
            (error, result) => {
              if (error || !result) {
                return reject(error || new Error('Cloudinary upload returned empty result'));
              }
              resolve({ url: result.secure_url, publicId: result.public_id });
            }
          );
          uploadStream.end(input);
        });
      }
    } catch (err: any) {
      console.warn('Cloudinary upload warning:', err.message);
    }
  }

  // 3. Fallback: Save to public/uploads on disk
  try {
    let buffer: Buffer;
    let ext = 'jpg';

    if (typeof input === 'string') {
      const match = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (match) {
        const mime = match[1];
        if (mime.includes('png')) ext = 'png';
        else if (mime.includes('webp')) ext = 'webp';
        else if (mime.includes('pdf')) ext = 'pdf';
        buffer = Buffer.from(match[2], 'base64');
      } else {
        buffer = Buffer.from(input, 'base64');
      }
    } else {
      buffer = input;
      if (mimeType.includes('png')) ext = 'png';
      else if (mimeType.includes('webp')) ext = 'webp';
      else if (mimeType.includes('pdf')) ext = 'pdf';
    }

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `${filenamePrefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, buffer);

    return { url: `/uploads/${fileName}` };
  } catch (fsErr) {
    // If running in read-only environment like Vercel serverless and disk write fails, return base64 data URI directly
    if (typeof input === 'string' && input.startsWith('data:')) {
      return { url: input };
    }
    throw fsErr;
  }
};

export default cloudinary;

