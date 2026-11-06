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
    // Fail within ~8 s when MongoDB is not there, so start-up can print a clear message instead of hanging.
    MongooseModule.forRootAsync({
      useFactory: () => ({ uri: resolveMongoUri(), serverSelectionTimeoutMS: 4000, retryAttempts: 1, retryDelay: 500 }),
    }),
    PeopleModule,
    SitesModule,
    SearchModule,
    VisitsModule,
    SeedModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
