import { plainToInstance, Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

const POSTGRES_URL = /^postgres(ql)?:\/\/.+/;

// Variables que la API necesita para arrancar (spec 0001, "Configuración requerida").
export class EnvironmentVariables {
  @IsEnum(NodeEnv, {
    message: 'NODE_ENV debe ser development, test o production',
  })
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @Matches(POSTGRES_URL, {
    message: 'DATABASE_URL debe ser una URL postgresql://',
  })
  DATABASE_URL: string;

  @Matches(POSTGRES_URL, {
    message: 'DIRECT_URL debe ser una URL postgresql://',
  })
  DIRECT_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET debe tener al menos 32 caracteres' })
  JWT_SECRET: string;

  @IsUrl(
    { require_tld: false, require_protocol: true },
    {
      message: 'WEB_ORIGIN debe ser una URL con protocolo (http:// o https://)',
    },
  )
  WEB_ORIGIN: string;

  @IsUrl(
    { require_tld: false, require_protocol: true },
    {
      message:
        'ADMIN_ORIGIN debe ser una URL con protocolo (http:// o https://)',
    },
  )
  ADMIN_ORIGIN: string;

  // Dominios institucionales para registrarse (spec 0004), separados por comas.
  @Matches(/^[a-z0-9.-]+(,[a-z0-9.-]+)*$/, {
    message:
      'ALLOWED_EMAIL_DOMAINS debe ser una lista de dominios separados por comas',
  })
  ALLOWED_EMAIL_DOMAINS: string = 'est.intec.edu.do,intec.edu.do';

  // Intentos por minuto por IP en registro y login (spec 0004).
  @IsInt()
  @Min(1)
  AUTH_RATE_LIMIT: number = 5;

  // Publicaciones por minuto por usuario (spec 0005).
  @IsInt()
  @Min(1)
  POST_RATE_LIMIT: number = 10;

  // Comentarios (crear y editar) por minuto por usuario (spec 0009, decisión 21).
  @IsInt()
  @Min(1)
  COMMENT_RATE_LIMIT: number = 20;

  // Blob Storage de los archivos (spec 0008, decisión 13). Opcional: sin ella
  // la API arranca y la subida responde STORAGE_UNAVAILABLE.
  @IsOptional()
  @IsString()
  AZURE_STORAGE_CONNECTION_STRING?: string;

  @Matches(/^[a-z0-9-]{3,63}$/, {
    message: 'AZURE_STORAGE_CONTAINER debe ser un nombre de contenedor válido',
  })
  AZURE_STORAGE_CONTAINER: string = 'media';

  // DSN del proyecto cafeta-api en Sentry (spec 0007). Opcional: sin él no se
  // envía nada. Vacío cuenta como ausente. instrument.ts la lee de process.env
  // porque corre antes que ConfigModule; aquí solo sirve para el aviso de arranque.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsOptional()
  @IsUrl(
    { require_protocol: true },
    { message: 'SENTRY_DSN debe ser una URL https:// de Sentry' },
  )
  SENTRY_DSN?: string;
}

// Si falta una variable o es inválida, la API no arranca y dice cuál.
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors
      .map(
        (e) =>
          `  ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${detail}`);
  }
  return env;
}
