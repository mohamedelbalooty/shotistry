import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isMockFallbackAllowed } from '../config/env.ts';
import { signAssetUrl } from './asset-storage.ts';

export interface PresignPutParams {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
}

export interface PresignGetParams {
  key: string;
  expiresInSeconds?: number;
  responseContentDisposition?: string;
}

export interface ObjectMetadata {
  key: string;
  contentLength: number;
  contentType: string;
  etag?: string;
  lastModified?: Date;
}

export interface ObjectStorage {
  presignPut(params: PresignPutParams): Promise<{ url: string; headers: Record<string, string> }>;
  presignGet(params: PresignGetParams): Promise<string>;
  head(key: string): Promise<ObjectMetadata | null>;
  getBuffer(key: string): Promise<{ buffer: Buffer; contentType: string } | null>;
  put(key: string, buffer: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<Array<{ key: string; size: number; lastModified?: Date }>>;
}

/**
 * Local filesystem-backed ObjectStorage implementation for local development and test suites.
 */
export class LocalFsObjectStorage implements ObjectStorage {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.join(process.cwd(), '.data', 'assets');
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private resolvePath(key: string): string {
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
    return path.resolve(this.baseDir, normalized);
  }

  private detectMime(key: string): string {
    if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
    if (key.endsWith('.webp')) return 'image/webp';
    return 'image/png';
  }

  async presignPut(params: PresignPutParams): Promise<{ url: string; headers: Record<string, string> }> {
    return {
      url: `/api/assets/upload?key=${encodeURIComponent(params.key)}`,
      headers: {
        'Content-Type': params.contentType,
        'Content-Length': String(params.contentLength),
      },
    };
  }

  async presignGet(params: PresignGetParams): Promise<string> {
    const signed = signAssetUrl(params.key, params.expiresInSeconds ?? 3600);
    return signed.url;
  }

  async head(key: string): Promise<ObjectMetadata | null> {
    const fullPath = this.resolvePath(key);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    const stat = fs.statSync(fullPath);
    return {
      key,
      contentLength: stat.size,
      contentType: this.detectMime(key),
      lastModified: stat.mtime,
    };
  }

  async getBuffer(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const fullPath = this.resolvePath(key);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    const buffer = fs.readFileSync(fullPath);
    return {
      buffer,
      contentType: this.detectMime(key),
    };
  }

  async put(key: string, buffer: Buffer, _contentType: string): Promise<void> {
    const fullPath = this.resolvePath(key);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolvePath(key);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  async list(prefix: string): Promise<Array<{ key: string; size: number; lastModified?: Date }>> {
    const targetDir = this.resolvePath(prefix);
    if (!fs.existsSync(targetDir)) {
      return [];
    }

    const results: Array<{ key: string; size: number; lastModified?: Date }> = [];
    const entries = fs.readdirSync(targetDir, { withFileTypes: true, recursive: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const full = path.join(entry.parentPath || targetDir, entry.name);
        const rel = path.relative(this.baseDir, full).replace(/\\/g, '/');
        const stat = fs.statSync(full);
        results.push({
          key: rel,
          size: stat.size,
          lastModified: stat.mtime,
        });
      }
    }
    return results;
  }
}

/**
 * Cloudflare R2 (S3-compatible) ObjectStorage implementation.
 */
export class R2ObjectStorage implements ObjectStorage {
  private client: S3Client;
  private bucket: string;

  constructor(options?: {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
  }) {
    const accountId = options?.accountId || process.env.R2_ACCOUNT_ID?.trim();
    const accessKeyId = options?.accessKeyId || process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = options?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY?.trim();
    const bucket = options?.bucketName || process.env.R2_BUCKET_NAME?.trim();

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        'Cloudflare R2 storage credentials are required (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)'
      );
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async presignPut(params: PresignPutParams): Promise<{ url: string; headers: Record<string, string> }> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    });

    const url = await getSignedUrl(this.client, cmd, {
      expiresIn: params.expiresInSeconds ?? 300,
    });

    return {
      url,
      headers: {
        'Content-Type': params.contentType,
      },
    };
  }

  async presignGet(params: PresignGetParams): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ...(params.responseContentDisposition
        ? { ResponseContentDisposition: params.responseContentDisposition }
        : {}),
    });

    return getSignedUrl(this.client, cmd, {
      expiresIn: params.expiresInSeconds ?? 600,
    });
  }

  async head(key: string): Promise<ObjectMetadata | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      return {
        key,
        contentLength: res.ContentLength ?? 0,
        contentType: res.ContentType || 'application/octet-stream',
        etag: res.ETag,
        lastModified: res.LastModified,
      };
    } catch (err: unknown) {
      const errName = (err as { name?: string })?.name;
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (errName === 'NotFound' || status === 404) {
        return null;
      }
      throw err;
    }
  }

  async getBuffer(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!res.Body) {
        return null;
      }

      const bytes = await res.Body.transformToByteArray();
      return {
        buffer: Buffer.from(bytes),
        contentType: res.ContentType || 'application/octet-stream',
      };
    } catch (err: unknown) {
      const errName = (err as { name?: string })?.name;
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (errName === 'NoSuchKey' || errName === 'NotFound' || status === 404) {
        return null;
      }
      throw err;
    }
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async list(prefix: string): Promise<Array<{ key: string; size: number; lastModified?: Date }>> {
    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      })
    );

    if (!res.Contents) {
      return [];
    }

    return res.Contents.map((obj) => ({
      key: obj.Key || '',
      size: obj.Size || 0,
      lastModified: obj.LastModified,
    }));
  }
}

let cachedStorage: ObjectStorage | null = null;

/**
 * Resolves the operational ObjectStorage provider.
 * Returns R2ObjectStorage when credentials are configured.
 * In local/test mode without credentials, returns LocalFsObjectStorage.
 * In staging/production mode without credentials, fails closed.
 */
export function getObjectStorage(): ObjectStorage {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKey = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();

  const isR2Configured = Boolean(
    accountId &&
      accessKey &&
      secretKey &&
      bucket &&
      !accountId.includes('placeholder') &&
      !accessKey.includes('placeholder')
  );

  if (isR2Configured) {
    if (!cachedStorage || !(cachedStorage instanceof R2ObjectStorage)) {
      cachedStorage = new R2ObjectStorage();
    }
    return cachedStorage;
  }

  if (isMockFallbackAllowed()) {
    if (!cachedStorage || !(cachedStorage instanceof LocalFsObjectStorage)) {
      cachedStorage = new LocalFsObjectStorage();
    }
    return cachedStorage;
  }

  throw new Error(
    'Cloudflare R2 storage credentials are required in staging and production (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)'
  );
}

