import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PeopleModule } from '../people/people.module';
import { SitesModule } from '../sites/sites.module';
import { Visit, VisitSchema } from './visit.schema';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Visit.name, schema: VisitSchema }]), PeopleModule, SitesModule],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [MongooseModule],
})
export class VisitsModule {}
