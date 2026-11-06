import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { intParam } from '../sites/sites.controller';
import { RecordVisitDto } from './visits.dto';
import { VisitsService } from './visits.service';

@Controller('people/:id/visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  list(@Param('id') id: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.visits.list(id, intParam('limit', limit, 50, 1, 100), typeof cursor === 'string' && cursor ? cursor : undefined);
  }

  @Post()
  async record(@Param('id') id: string, @Body() dto: RecordVisitDto, @Res({ passthrough: true }) res: Response) {
    const { visit, created } = await this.visits.record(id, dto);
    res.status(created ? 201 : 200);
    return visit;
  }
}
