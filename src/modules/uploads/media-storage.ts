// Dónde viven los archivos. La API depende de esta interfaz, no de Azure: las
// pruebas inyectan una en memoria y producción usa AzureBlobStorage.
export interface StoredObject {
  contentType: string;
  sizeBytes: number;
  ownerId: string | null;
}

export abstract class MediaStorage {
  /** Guarda el archivo con quien lo subió, para validar su dueño al usarlo. */
  abstract put(
    key: string,
    data: Buffer,
    contentType: string,
    ownerId: string,
  ): Promise<void>;

  /** Datos del archivo, o null si no existe. */
  abstract describe(key: string): Promise<StoredObject | null>;

  /** Borra el archivo; si ya no existía, no pasa nada. */
  abstract remove(key: string): Promise<void>;

  /** Enlace de solo lectura que vence en expiresOn. */
  abstract readUrl(key: string, expiresOn: Date): string;
}
