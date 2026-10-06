import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { BlocksController } from './blocks.controller.js';
import { BlocksService } from './blocks.service.js';

@Module({
  imports: [PrismaModule, AuditModule, UploadsModule],
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
