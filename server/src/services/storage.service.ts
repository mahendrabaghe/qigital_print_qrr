import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { env } from '../config/env';
import { HttpError } from '../utils/errors';

/**
 * File storage abstraction. The default implementation stores files on local disk.
 * To use S3/R2/Cloudinary in production, implement the same interface and swap
 * the exported instance — nothing else in the codebase touches the filesystem.
 */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Readable;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

function safeKey(key: string): string {
  // Storage keys are always server-generated (shopId/sessionId/uuid), but guard
  // against traversal regardless of where a key might originate from.
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(root, normalized);
  if (!resolved.startsWith(root)) throw new HttpError(400, 'INVALID_KEY', 'Invalid storage key');
  return resolved;
}

let root = path.resolve(process.cwd(), env.storageDir);

class LocalDiskStorage implements FileStorage {
  async put(key: string, data: Buffer): Promise<void> {
    const file = safeKey(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, data);
  }

  async get(key: string): Promise<Buffer> {
    const file = safeKey(key);
    try {
      return await fsp.readFile(file);
    } catch {
      throw new HttpError(404, 'FILE_NOT_FOUND', 'File not found or already deleted');
    }
  }

  getStream(key: string): Readable {
    const file = safeKey(key);
    if (!fs.existsSync(file)) {
      throw new HttpError(404, 'FILE_NOT_FOUND', 'File not found or already deleted');
    }
    return fs.createReadStream(file);
  }

  async delete(key: string): Promise<void> {
    const file = safeKey(key);
    try {
      await fsp.unlink(file);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const file = safeKey(key);
    return fs.existsSync(file);
  }
}

export const storage: FileStorage = new LocalDiskStorage();
