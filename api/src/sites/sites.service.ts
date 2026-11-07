import { ConflictException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ADDRESS_HINT, normalizeAddress, toAddress } from '../common/address';
import { fieldErrors, nowhere } from '../common/errors';
import { hasVisibleContent, inspectPage, NOTHING_TO_SHOW, PageContent } from '../common/page-content';
import { PeopleService } from '../people/people.service';
import { AuthorRef, PublishSiteDto, ReplaceSiteDto, SiteDto, SiteSummaryDto } from './sites.dto';
import { Site } from './site.schema';

/** The fields a site is built from, before sanitizing. Shared by publish, replace and the seed. */
export interface SiteInput {
  address: string;
  title: string;
  html: string;
  authorId: string;
}

export interface PreparedSite {
  address: string;
  title: string;
  html: string;
  text: string;
  authorId: string;
}

/**
 * Sanitize the HTML and derive the search text, through inspectPage(): the one definition shared with
 * POST /sites/preview. The only way a Site body is ever built. (The seed spreads this straight into the
 * document, so it carries no extra fields; judge emptiness with hasVisibleContent before storing.)
 */
export function prepareSite(input: SiteInput): PreparedSite {
  const { html, text } = inspectPage(input.html);
  return { address: input.address, title: input.title, html, text, authorId: input.authorId };
}

@Injectable()
export class SitesService implements OnModuleInit {
  constructor(
    @InjectModel(Site.name) private readonly model: Model<Site>,
    private readonly people: PeopleService,
  ) {}

  async onModuleInit() {
    await this.model.init();
  }

  async get(rawAddress: string): Promise<SiteDto> {
    const address = toAddress(rawAddress);
    if (!address) throw nowhere(normalizeAddress(rawAddress).address || rawAddress);
    const site = await this.model.findOne({ address }).lean();
    if (!site) throw nowhere(address);
    return this.toDto(site, await this.authorOf(site.authorId));
  }

  async list(limit: number, offset: number): Promise<{ total: number; items: SiteSummaryDto[] }> {
    const [total, rows] = await Promise.all([
      this.model.countDocuments(),
      this.model.find({}, { address: 1, title: 1, authorId: 1, createdAt: 1 }).sort({ address: 1 }).skip(offset).limit(limit).lean(),
    ]);
    const names = await this.people.namesBySlug(rows.map((r) => r.authorId));
    const items = rows.map((r) => ({
      address: r.address,
      title: r.title,
      author: { id: r.authorId, name: names.get(r.authorId) ?? r.authorId },
      createdAt: r.createdAt.toISOString(),
    }));
    return { total, items };
  }

  /**
   * Does a site exist at this address? Unlike get(), a missing site is an ordinary answer (found:false), so a
   * client can check existence without a 404 showing up in its console. A malformed address is still a 400.
   */
  async resolve(rawAddress: unknown): Promise<{ address: string; found: boolean }> {
    const norm = normalizeAddress(rawAddress);
    if (!norm.valid) throw fieldErrors({ address: [ADDRESS_HINT] });
    return { address: norm.address, found: (await this.model.exists({ address: norm.address })) !== null };
  }

  /**
   * Dry run of publishing: exactly what would be stored for this HTML, with no database access.
   * Same inspectPage() as publish and replace, so the preview cannot disagree with the result.
   */
  preview(html: string): PageContent {
    return inspectPage(html);
  }

  async publish(dto: PublishSiteDto): Promise<SiteDto> {
    const norm = normalizeAddress(dto.address);
    if (!norm.valid) throw fieldErrors({ address: [ADDRESS_HINT] });
    const prepared = prepareSite({ address: norm.address, title: dto.title, html: dto.html, authorId: dto.authorId });
    const problems: Record<string, string[]> = {};
    if (!(await this.people.hasRole(dto.authorId, 'author'))) problems.authorId = ['authorId must be a person with the author role'];
    if (!hasVisibleContent(prepared)) problems.html = [NOTHING_TO_SHOW];
    if (Object.keys(problems).length > 0) throw fieldErrors(problems);
    const now = new Date();
    try {
      const created = await this.model.create({ ...prepared, revision: 1, createdAt: now, updatedAt: now });
      return this.toDto(created.toObject(), await this.authorOf(created.authorId));
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new ConflictException('address already published');
      throw err;
    }
  }

  async replace(rawAddress: string, dto: ReplaceSiteDto): Promise<SiteDto> {
    const address = toAddress(rawAddress);
    if (!address) throw nowhere(rawAddress);
    const existing = await this.model.findOne({ address }).lean();
    if (!existing) throw nowhere(address);
    if (existing.authorId !== dto.authorId) throw new ForbiddenException('only the author can replace this site');
    const prepared = prepareSite({ address, title: dto.title, html: dto.html, authorId: existing.authorId });
    if (!hasVisibleContent(prepared)) throw fieldErrors({ html: [NOTHING_TO_SHOW] });
    const updated = await this.model
      .findOneAndUpdate(
        { address },
        { $set: { title: prepared.title, html: prepared.html, text: prepared.text, updatedAt: new Date() }, $inc: { revision: 1 } },
        { new: true },
      )
      .lean();
    if (!updated) throw nowhere(address);
    return this.toDto(updated, await this.authorOf(updated.authorId));
  }

  private async authorOf(slug: string): Promise<AuthorRef> {
    const names = await this.people.namesBySlug([slug]);
    return { id: slug, name: names.get(slug) ?? slug };
  }

  private toDto(site: Site, author: AuthorRef): SiteDto {
    return {
      address: site.address,
      title: site.title,
      html: site.html,
      author,
      revision: site.revision,
      createdAt: site.createdAt.toISOString(),
      updatedAt: site.updatedAt.toISOString(),
    };
  }
}
