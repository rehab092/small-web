import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PeopleService } from '../people/people.service';
import { AuthorRef } from '../sites/sites.dto';
import { Site } from '../sites/site.schema';
import { buildSnippet, queryTerms, SnippetSegment, toTextSearch } from './snippet';

export interface SearchResultDto {
  address: string;
  title: string;
  author: AuthorRef;
  score: number;
  snippet: SnippetSegment[];
}

export interface SearchResponseDto {
  query: string;
  total: number;
  results: SearchResultDto[];
}

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Site.name) private readonly sites: Model<Site>,
    private readonly people: PeopleService,
  ) {}

  async search(rawQuery: string, limit: number, offset: number): Promise<SearchResponseDto> {
    const terms = queryTerms(rawQuery);
    if (terms.length === 0) return { query: '', total: 0, results: [] };
    const filter = { $text: { $search: toTextSearch(terms) } };

    const [total, rows] = await Promise.all([
      this.sites.countDocuments(filter),
      this.sites
        .find(filter, { score: { $meta: 'textScore' }, address: 1, title: 1, text: 1, authorId: 1 })
        .sort({ score: { $meta: 'textScore' }, address: 1 })
        .skip(offset)
        .limit(limit)
        .lean<Array<Site & { score: number }>>(),
    ]);
    const names = await this.people.namesBySlug(rows.map((r) => r.authorId));

    return {
      query: terms.join(' '),
      total,
      results: rows.map((r) => ({
        address: r.address,
        title: r.title,
        author: { id: r.authorId, name: names.get(r.authorId) ?? r.authorId },
        score: Math.round(r.score * 1000) / 1000,
        snippet: buildSnippet(r.text, terms),
      })),
    };
  }
}
