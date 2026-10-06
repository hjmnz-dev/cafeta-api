import { Module } from '@nestjs/common';
import { ErrorReporter } from './error-reporter.js';
import { MonitoringStatus } from './monitoring-status.js';
import { ReportThrottle } from './report-throttle.js';

// Monitoreo de errores (spec 0007): el filtro global usa ErrorReporter.
@Module({
  providers: [ErrorReporter, ReportThrottle, MonitoringStatus],
  exports: [ErrorReporter],
})
export class MonitoringModule {}
