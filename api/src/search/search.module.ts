import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module';
import { SitesModule } from '../sites/sites.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [SitesModule, PeopleModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
