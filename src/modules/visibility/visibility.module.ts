import { Module } from '@nestjs/common';
import { VisibilityService } from './visibility.service.js';

// Regla de visibilidad compartida (decisión 15).
@Module({
  providers: [VisibilityService],
  exports: [VisibilityService],
})
export class VisibilityModule {}
