import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'collabboard-uploads';
const REGION = process.env.AWS_REGION || 'us-east-1';

// Setup S3 Client if credentials are provided
const s3Configured = !!(
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
);

const s3Client = s3Configured
  ? new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export const presignedSchema = z.object({
  body: z.object({
    boardId: z.string().uuid(),
    fileName: z.string().min(1),
    fileType: z.string().min(1),
    fileSize: z.number().max(10 * 1024 * 1024), // Max 10MB
  }),
});

export const getPresignedUrl = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { fileName, fileType } = req.body;
  
  // Whitelist extensions
  const allowedExtensions = ['png', 'jpg', 'jpeg', 'svg', 'json'];
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
  
  if (!allowedExtensions.includes(fileExtension)) {
    return res.status(400).json({
      status: 'error',
      message: `Invalid file extension. Allowed extensions: ${allowedExtensions.join(', ')}`,
    });
  }

  // Validate MIME type
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'application/json'];
  if (!allowedMimeTypes.includes(fileType)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid file MIME type.',
    });
  }

  // Generate strict UUID-based safe filename
  const key = `${req.user.userId}/${uuidv4()}.${fileExtension}`;

  try {
    if (s3Configured && s3Client) {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: fileType,
      });

      const presignedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600, // 1 hour expiration
      });

      const fileUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;

      return res.json({
        status: 'success',
        data: {
          uploadUrl: presignedUrl,
          fileUrl,
          isMock: false,
        },
      });
    } else {
      // Fallback: Local dev mock upload configuration
      const devUploadUrl = `${req.protocol}://${req.get('host')}/api/v1/files/upload-local?key=${encodeURIComponent(key)}`;
      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${key}`;

      return res.json({
        status: 'success',
        data: {
          uploadUrl: devUploadUrl,
          fileUrl,
          isMock: true,
        },
      });
    }
  } catch (error) {
    console.error('Presigned URL error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to generate upload URL' });
  }
};

/**
 * Fallback local development file writer with directory traversal checks
 */
export const handleLocalDevUpload = async (req: AuthenticatedRequest, res: Response) => {
  const { key } = req.query;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ status: 'error', message: 'Missing key parameter' });
  }

  try {
    const uploadsBaseDir = path.resolve(process.cwd(), 'uploads');
    const resolvedPath = path.resolve(uploadsBaseDir, key);

    // Directory Traversal Prevention: Ensure path remains inside uploadsBaseDir
    if (!resolvedPath.startsWith(uploadsBaseDir)) {
      return res.status(403).json({
        status: 'error',
        message: 'Access Denied: Path traversal detected.',
      });
    }

    const uploadDir = path.dirname(resolvedPath);
    
    // Ensure directory paths exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(resolvedPath);

    req.pipe(writeStream);

    req.on('end', () => {
      res.json({
        status: 'success',
        message: 'Mock file uploaded locally',
      });
    });

    writeStream.on('error', (err) => {
      console.error('Write stream error:', err);
      res.status(500).json({ status: 'error', message: 'Failed to write file locally' });
    });
  } catch (err) {
    console.error('Local dev upload error:', err);
    res.status(500).json({ status: 'error', message: 'Local upload failed' });
  }
};
