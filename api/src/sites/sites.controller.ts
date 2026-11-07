import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { fieldErrors } from '../common/errors';
import { PreviewSiteDto, PublishSiteDto, ReplaceSiteDto } from './sites.dto';
import { SitesService } from './sites.service';

/** Parse an optional integer query param within [min, max]; anything else is a field error. */
export function intParam(name: string, raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw fieldErrors({ [name]: [`${name} must be an integer between ${min} and ${max}`] });
  return n;
}

/**
 * Parse an optional `limit`: a number outside [min, max] is clamped silently (limit=200 on a route capped
 * at 100 returns 100 items, not an error); something that is not an integer at all is still a field error.
 */
export function clampedLimit(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw fieldErrors({ limit: ['limit must be an integer'] });
  return Math.min(max, Math.max(min, n));
}

/** GET /resolve?address=: existence check that answers 200 { address, found } instead of a 404. */
@Controller('resolve')
export class ResolveController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  resolve(@Query('address') address?: string) {
    return this.sites.resolve(address);
  }
}

@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  list(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.sites.list(clampedLimit(limit, 50, 1, 100), intParam('offset', offset, 0, 0, 1_000_000));
  }

  @Get(':address')
  get(@Param('address') address: string) {
    return this.sites.get(address);
  }

  /** Dry run of publish: what the sanitizer would store for this HTML. Writes nothing. */
  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: PreviewSiteDto) {
    return this.sites.preview(dto.html);
  }

  @Post()
  publish(@Body() dto: PublishSiteDto) {
    return this.sites.publish(dto);
  }

  @Put(':address')
  replace(@Param('address') address: string, @Body() dto: ReplaceSiteDto) {
    return this.sites.replace(address, dto);
  }
}
