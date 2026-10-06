import { resolve } from 'node:path';
import * as Sentry from '@sentry/node';
import { VERSION_FILE as HEALTH_VERSION_FILE } from '../../health/app-version.js';
import { VERSION_FILE as INSTRUMENT_VERSION_FILE } from '../../instrument.js';
import { scrubEvent } from './scrub.js';
import { sentryOptions } from './sentry-options.js';

describe('sentryOptions', () => {
  const options = sentryOptions('https://k@o1.ingest.us.sentry.io/1', 'abc123');

  it('apaga trazas, breadcrumbs y datos personales', () => {
    expect(options.environment).toBe('production');
    expect(options.release).toBe('abc123');
    expect(options.maxBreadcrumbs).toBe(0);
    expect(options.enableOpenTelemetrySetup).toBe(false);
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    });
    expect(options.beforeSend).toBe(scrubEvent);
  });

  it('las promesas rechazadas usan el modo strict', () => {
    const integrations = options.integrations as { name: string }[];
    expect(integrations.map((i) => i.name)).toContain('OnUnhandledRejection');
  });
});

describe('instrument.ts', () => {
  it('sin SENTRY_DSN no inicia Sentry', () => {
    expect(process.env.SENTRY_DSN ?? '').toBe('');
    expect(Sentry.getClient()).toBeUndefined();
  });

  it('lee el mismo version.txt que /health', () => {
    expect(resolve(INSTRUMENT_VERSION_FILE)).toBe(resolve(HEALTH_VERSION_FILE));
  });
});
