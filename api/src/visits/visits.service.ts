import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ADDRESS_HINT, normalizeAddress } from '../common/address';
import { fieldErrors } from '../common/errors';
import { PeopleService } from '../people/people.service';
import { Site } from '../sites/site.schema';
import { Visit } from './visit.schema';
import { RecordVisitDto, VisitDto, VisitPageDto } from './visits.dto';

type VisitRow = Visit & { _id: Types.ObjectId };

export function encodeCursor(at: Date, id: Types.ObjectId): string {
  return Buffer.from(`${at.getTime()}:${id.toHexString()}`).toString('base64url');
}

export function decodeCursor(cursor: string): { at: Date; id: Types.ObjectId } | null {
  try {
    const [ms, hex] = Buffer.from(cursor, 'base64url').toString().split(':');
    if (!/^\d+$/.test(ms ?? '') || !Types.ObjectId.isValid(hex ?? '') || (hex ?? '').length !== 24) return null;
    return { at: new Date(Number(ms)), id: new Types.ObjectId(hex) };
  } catch {
    return null;
  }
}

@Injectable()
export class VisitsService implements OnModuleInit {
  constructor(
    @InjectModel(Visit.name) private readonly visits: Model<Visit>,
    @InjectModel(Site.name) private readonly sites: Model<Site>,
    private readonly people: PeopleService,
  ) {}

  async onModuleInit() {
    await this.visits.init();
  }

  async list(personId: string, limit: number, cursor?: string): Promise<VisitPageDto> {
    await this.assertPerson(personId);
    const filter: Record<string, unknown> = { personId };
    if (cursor) {
      const c = decodeCursor(cursor);
      if (!c) throw fieldErrors({ cursor: ['cursor is not valid'] });
      filter.$or = [{ at: { $lt: c.at } }, { at: c.at, _id: { $lt: c.id } }];
    }
    const rows = (await this.visits.find(filter).sort({ at: -1, _id: -1 }).limit(limit + 1).lean()) as VisitRow[];
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: await this.toDtos(page),
      nextCursor: rows.length > limit && last ? encodeCursor(last.at, last._id) : null,
    };
  }

  /** Returns the visit and whether it was newly created (false = replayed requestId). */
  async record(personId: string, dto: RecordVisitDto): Promise<{ visit: VisitDto; created: boolean }> {
    await this.assertPerson(personId);
    const norm = normalizeAddress(dto.address);
    if (!norm.valid) throw fieldErrors({ address: [ADDRESS_HINT] });

    if (dto.requestId) {
      const existing = (await this.visits.findOne({ personId, requestId: dto.requestId }).lean()) as VisitRow | null;
      if (existing) return { visit: (await this.toDtos([existing]))[0], created: false };
    }
    const found = (await this.sites.exists({ address: norm.address })) !== null;
    try {
      const doc = await this.visits.create({
        personId,
        address: norm.address,
        at: new Date(),
        via: dto.via,
        found,
        ...(dto.requestId ? { requestId: dto.requestId } : {}),
      });
      return { visit: (await this.toDtos([doc.toObject() as VisitRow]))[0], created: true };
    } catch (err) {
      // Two identical requestIds racing: the unique index lets exactly one win.
      if ((err as { code?: number }).code === 11000 && dto.requestId) {
        const winner = (await this.visits.findOne({ personId, requestId: dto.requestId }).lean()) as VisitRow;
        return { visit: (await this.toDtos([winner]))[0], created: false };
      }
      throw err;
    }
  }

  private async assertPerson(personId: string): Promise<void> {
    if (!(await this.people.exists(personId))) throw new NotFoundException('person not found');
  }

  /** Attach the current title of each found site. */
  private async toDtos(rows: VisitRow[]): Promise<VisitDto[]> {
    const addresses = [...new Set(rows.filter((r) => r.found).map((r) => r.address))];
    const sites = addresses.length ? await this.sites.find({ address: { $in: addresses } }, { address: 1, title: 1 }).lean() : [];
    const titles = new Map(sites.map((s) => [s.address, s.title]));
    return rows.map((r) => ({
      id: r._id.toHexString(),
      address: r.address,
      title: r.found ? (titles.get(r.address) ?? null) : null,
      at: r.at.toISOString(),
      via: r.via,
      found: r.found,
    }));
  }
}
