import { Controller, Post, UseInterceptors, UploadedFile, Headers, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { join, basename } from 'path';
import { promises as fs } from 'fs';

function verifyBearer(authorization?: string): boolean {
  if (!authorization) return false;
  const parts = authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false;
  return true;
}

@Controller('uploads')
export class UploadsController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, unique + extname(file.originalname || ''));
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (String(file.mimetype).startsWith('image/')) cb(null, true);
        else cb(new Error('File type not allowed'), false);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Headers('authorization') authorization?: string) {
    if (!verifyBearer(authorization)) return { ok: false, error: 'Unauthorized' };
    if (!file) return { ok: false, error: 'No file uploaded' };
    const path = `/uploads/${file.filename}`;
    return { ok: true, path };
  }

  @Post('pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, unique + extname(file.originalname || ''));
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (String(file.mimetype).toLowerCase() === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF allowed'), false);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadPdf(@UploadedFile() file: Express.Multer.File | undefined, @Headers('authorization') authorization?: string) {
    if (!verifyBearer(authorization)) return { ok: false, error: 'Unauthorized' };
    if (!file) return { ok: false, error: 'No file uploaded' };
    const path = `/uploads/${file.filename}`;
    return { ok: true, path };
  }

  @Post('remove')
  async remove(@Body() body: { path?: string }, @Headers('authorization') authorization?: string) {
    if (!verifyBearer(authorization)) return { ok: false, error: 'Unauthorized' };
    const p = String(body?.path || '');
    if (!p || !p.startsWith('/uploads/')) return { ok: false, error: 'Invalid path' };
    try {
      const root = join(__dirname, '..', 'uploads');
      const file = basename(p);
      const full = join(root, file);
      await fs.unlink(full);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: 'Failed to remove file' };
    }
  }
}
