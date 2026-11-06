import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength } from 'class-validator';
import { IsSmallWebAddress } from '../common/is-small-web-address';
import { MAX_HTML_LENGTH } from '../common/sanitizer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PublishSiteDto {
  @IsString()
  @MaxLength(200)
  @IsSmallWebAddress()
  address!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 120, { message: 'title must be between 1 and 120 characters' })
  title!: string;

  @IsString()
  @Length(1, MAX_HTML_LENGTH, { message: `html must be between 1 and ${MAX_HTML_LENGTH} characters` })
  html!: string;

  @IsString()
  @Length(1, 64)
  authorId!: string;
}

export class ReplaceSiteDto {
  @Transform(trim)
  @IsString()
  @Length(1, 120, { message: 'title must be between 1 and 120 characters' })
  title!: string;

  @IsString()
  @Length(1, MAX_HTML_LENGTH, { message: `html must be between 1 and ${MAX_HTML_LENGTH} characters` })
  html!: string;

  @IsString()
  @Length(1, 64)
  authorId!: string;
}

export interface AuthorRef {
  id: string;
  name: string;
}

export interface SiteDto {
  address: string;
  title: string;
  html: string;
  author: AuthorRef;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiteSummaryDto {
  address: string;
  title: string;
  author: AuthorRef;
  createdAt: string;
}
