import { Controller, Get, Param, Query } from '@nestjs/common';
import { fieldErrors } from '../common/errors';
import { PeopleService } from './people.service';
import { PersonRole } from './person.schema';

@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  list(@Query('role') role?: string) {
    if (role !== undefined && role !== 'author' && role !== 'browser') {
      throw fieldErrors({ role: ['role must be author or browser'] });
    }
    return this.people.list(role as PersonRole | undefined);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.people.get(id);
  }
}
