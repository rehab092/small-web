import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { clampedLimit } from '../sites/sites.controller';
import { RecordVisitDto } from './visits.dto';
import { VisitsService } from './visits.service';

@Controller('people/:id/visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  /**
   * limit is clamped to [1, 100]; q (optional) filters the whole history server-side.
   * q is typed `unknown` on purpose: as `string`, the ValidationPipe would turn a repeated `?q=a&q=b`
   * into the single literal text "a,b", which silently matches nothing. The first value is used instead.
   */
  @Get()
  list(@Param('id') id: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string, @Query('q') q?: unknown) {
    const filter = Array.isArray(q) ? q[0] : q;
    return this.visits.list(id, clampedLimit(limit, 50, 1, 100), typeof cursor === 'string' && cursor ? cursor : undefined, typeof filter === 'string' ? filter : undefined);
  }

  @Post()
  async record(@Param('id') id: string, @Body() dto: RecordVisitDto, @Res({ passthrough: true }) res: Response) {
    const { visit, created } = await this.visits.record(id, dto);
    res.status(created ? 201 : 200);
    return visit;
  }
}
