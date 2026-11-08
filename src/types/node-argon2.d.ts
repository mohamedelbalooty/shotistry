// Module augmentation for native Argon2 in Node.js 24+ (OpenSSL 3.2+)
// @types/node@22 does not yet include these declarations.

declare module 'node:crypto' {
  export interface Argon2Parameters {
    message: string | NodeJS.ArrayBufferView;
    nonce: string | NodeJS.ArrayBufferView;
    parallelism?: number;
    tagLength?: number;
    memory?: number;
    passes?: number;
    secret?: NodeJS.ArrayBufferView;
    associatedData?: NodeJS.ArrayBufferView;
    type?: number;
  }

  export function argon2(
    algorithm: 'argon2d' | 'argon2i' | 'argon2id',
    parameters: Argon2Parameters,
    callback: (error: Error | null, derivedKey: Buffer) => void
  ): void;

  export function argon2Sync(
    algorithm: 'argon2d' | 'argon2i' | 'argon2id',
    parameters: Argon2Parameters
  ): Buffer;
}

declare module 'crypto' {
  export interface Argon2Parameters {
    message: string | NodeJS.ArrayBufferView;
    nonce: string | NodeJS.ArrayBufferView;
    parallelism?: number;
    tagLength?: number;
    memory?: number;
    passes?: number;
    secret?: NodeJS.ArrayBufferView;
    associatedData?: NodeJS.ArrayBufferView;
    type?: number;
  }

  export function argon2(
    algorithm: 'argon2d' | 'argon2i' | 'argon2id',
    parameters: Argon2Parameters,
    callback: (error: Error | null, derivedKey: Buffer) => void
  ): void;

  export function argon2Sync(
    algorithm: 'argon2d' | 'argon2i' | 'argon2id',
    parameters: Argon2Parameters
  ): Buffer;
}
