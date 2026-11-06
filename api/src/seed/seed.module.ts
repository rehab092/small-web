import { Module } from '@nestjs/common';
import { PeopleModule } from '../people/people.module';
import { SitesModule } from '../sites/sites.module';
import { VisitsModule } from '../visits/visits.module';
import { SeedService } from './seed.service';

@Module({
  imports: [PeopleModule, SitesModule, VisitsModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
