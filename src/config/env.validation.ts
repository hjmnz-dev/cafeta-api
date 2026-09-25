import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
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
