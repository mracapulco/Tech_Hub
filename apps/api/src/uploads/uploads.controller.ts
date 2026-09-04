import { Body, Controller, Post, UseInterceptors, UploadedFile, Headers } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, unlinkSync } from 'fs';
import { extname, join, normalize } from 'path';
import { JwtService } from '@nestjs/jwt';
import { getBearerToken } from '../common/auth-context';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly jwt: JwtService) {}

  private isAuthenticated(authorization?: string): boolean {
    const token = getBearerToken(authorization);
    if (!token) return false;
    try {
      this.jwt.verify(token);
      return true;
    } catch {
      return false;
    }
  }

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
    if (!this.isAuthenticated(authorization)) return { ok: false, error: 'Unauthorized' };
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
    if (!this.isAuthenticated(authorization)) return { ok: false, error: 'Unauthorized' };
    if (!file) return { ok: false, error: 'No file uploaded' };
    const path = `/uploads/${file.filename}`;
    return { ok: true, path };
  }

  @Post('remove')
  async remove(@Body() body: { path?: string }, @Headers('authorization') authorization?: string) {
    if (!this.isAuthenticated(authorization)) return { ok: false, error: 'Unauthorized' };
    const rawPath = String(body?.path || '').trim();
    if (!rawPath.startsWith('/uploads/')) return { ok: false, error: 'Caminho inválido' };
    const fileName = rawPath.replace(/^\/uploads\//, '');
    if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return { ok: false, error: 'Arquivo inválido' };
    }
    const target = normalize(join(process.cwd(), 'uploads', fileName));
    const uploadsRoot = normalize(join(process.cwd(), 'uploads'));
    if (!target.startsWith(uploadsRoot)) return { ok: false, error: 'Arquivo inválido' };
    if (existsSync(target)) unlinkSync(target);
    return { ok: true };
  }
}
