import { Injectable } from '@nestjs/common';
import { ACTIVE } from '../../common/soft-delete/soft-delete.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CareerDto } from './dto/career.dto.js';

// Dueño de la tabla careers: el catálogo de carreras de INTEC.
@Injectable()
export class CareersService {
  constructor(private readonly prisma: PrismaService) {}

  listActive(): Promise<CareerDto[]> {
    return this.prisma.career.findMany({
      where: ACTIVE,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async isActive(id: string): Promise<boolean> {
    return (await this.prisma.career.count({ where: { id, ...ACTIVE } })) > 0;
  }
}
