import { Controller, Get, Query } from '@nestjs/common';
import { intParam } from '../sites/sites.controller';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.search.search(typeof q === 'string' ? q : '', intParam('limit', limit, 20, 1, 50), intParam('offset', offset, 0, 0, 1_000_000));
  }
}
