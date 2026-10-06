import {
  MediaStorage,
  type StoredObject,
} from '../../src/modules/uploads/media-storage.js';

// Blob en memoria para las e2e: las pruebas no dependen de Azure ni de Azurite.
export class MemoryMediaStorage extends MediaStorage {
  readonly objects = new Map<string, StoredObject & { data: Buffer }>();

  async put(
    key: string,
    data: Buffer,
    contentType: string,
    ownerId: string,
  ): Promise<void> {
    this.objects.set(key, {
      data,
      contentType,
      sizeBytes: data.length,
      ownerId,
    });
  }

  async describe(key: string): Promise<StoredObject | null> {
    const found = this.objects.get(key);
    return found
      ? {
          contentType: found.contentType,
          sizeBytes: found.sizeBytes,
          ownerId: found.ownerId,
        }
      : null;
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(key);
  }

  readUrl(key: string, expiresOn: Date): string {
    return `https://blob.test/media/${key}?se=${expiresOn.toISOString()}`;
  }
}
