import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobSASPermissions,
  BlobServiceClient,
  type ContainerClient,
  generateBlobSASQueryParameters,
  RestError,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { MediaStorage, type StoredObject } from './media-storage.js';

// Contenedor privado de Azure Blob (spec 0008, decisión 13). En local apunta a
// Azurite. Sin cadena de conexión la API arranca igual y la subida responde
// STORAGE_UNAVAILABLE.
@Injectable()
export class AzureBlobStorage extends MediaStorage {
  private readonly logger = new Logger(AzureBlobStorage.name);
  private readonly container: ContainerClient | null;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    const connection = config.get('AZURE_STORAGE_CONNECTION_STRING', {
      infer: true,
    });
    this.container = connection
      ? BlobServiceClient.fromConnectionString(connection).getContainerClient(
          config.get('AZURE_STORAGE_CONTAINER', { infer: true }),
        )
      : null;
  }

  private client(): ContainerClient {
    if (!this.container) {
      throw new ServiceUnavailableException({
        message: 'El almacenamiento de archivos no está configurado',
        code: 'STORAGE_UNAVAILABLE',
      });
    }
    return this.container;
  }

  async put(
    key: string,
    data: Buffer,
    contentType: string,
    ownerId: string,
  ): Promise<void> {
    const container = this.client();
    const upload = () =>
      container.getBlockBlobClient(key).uploadData(data, {
        blobHTTPHeaders: {
          blobContentType: contentType,
          blobCacheControl: 'private, max-age=3600',
        },
        metadata: { ownerid: ownerId },
      });
    try {
      await upload();
    } catch (error) {
      // En local (Azurite) el contenedor no existe hasta la primera subida; en
      // producción lo crea el runbook y este camino no se recorre.
      if (!(error instanceof RestError && error.code === 'ContainerNotFound')) {
        throw this.unavailable(error);
      }
      try {
        await container.createIfNotExists();
        await upload();
      } catch (retryError) {
        throw this.unavailable(retryError);
      }
    }
  }

  async describe(key: string): Promise<StoredObject | null> {
    try {
      const props = await this.client().getBlobClient(key).getProperties();
      return {
        contentType: props.contentType ?? 'application/octet-stream',
        sizeBytes: props.contentLength ?? 0,
        ownerId: props.metadata?.ownerid ?? null,
      };
    } catch (error) {
      if (error instanceof RestError && error.statusCode === 404) return null;
      throw this.unavailable(error);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client().getBlobClient(key).deleteIfExists();
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  // Firma local con la clave de la cuenta: no llama a Azure.
  readUrl(key: string, expiresOn: Date): string {
    const container = this.client();
    const blob = container.getBlobClient(key);
    if (!(blob.credential instanceof StorageSharedKeyCredential)) {
      throw this.unavailable(new Error('La cadena de conexión no trae clave'));
    }
    const sas = generateBlobSASQueryParameters(
      {
        containerName: container.containerName,
        blobName: key,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      blob.credential,
    );
    return `${blob.url}?${sas.toString()}`;
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    if (error instanceof ServiceUnavailableException) return error;
    this.logger.error(error instanceof Error ? error.stack : String(error));
    return new ServiceUnavailableException({
      message: 'No se pudo usar el almacenamiento de archivos',
      code: 'STORAGE_UNAVAILABLE',
    });
  }
}
