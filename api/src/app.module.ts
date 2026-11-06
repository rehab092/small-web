import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { resolveMongoUri } from './db/database';
import { HealthController } from './health.controller';
import { PeopleModule } from './people/people.module';
import { SearchModule } from './search/search.module';
import { SeedModule } from './seed/seed.module';
import { SitesModule } from './sites/sites.module';
import { VisitsModule } from './visits/visits.module';

@Module({
  imports: [
    MongooseModule.forRootAsync({ useFactory: () => ({ uri: resolveMongoUri() }) }),
    PeopleModule,
    SitesModule,
    SearchModule,
    VisitsModule,
    SeedModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
