import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module.js';
import { VisibilityModule } from '../visibility/visibility.module.js';
import { DiscoverPeopleService } from './discover-people.service.js';
import { SearchController } from './search.controller.js';
import { SearchRepository } from './search.repository.js';
import { SearchService } from './search.service.js';

// Búsqueda y descubrimiento (spec 0008, decisión 28).
@Module({
  imports: [VisibilityModule, UploadsModule],
  controllers: [SearchController],
  providers: [SearchService, SearchRepository, DiscoverPeopleService],
})
export class SearchModule {}
