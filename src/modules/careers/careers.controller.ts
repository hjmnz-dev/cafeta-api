import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { CareersService } from './careers.service.js';
import { CareerDto } from './dto/career.dto.js';

@ApiTags('careers')
@Controller('careers')
export class CareersController {
  constructor(private readonly careers: CareersService) {}

  // Pública: el formulario de registro la necesita antes de tener sesión.
  @Public()
  @Get()
  list(): Promise<CareerDto[]> {
    return this.careers.listActive();
  }
}
