import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { IsSmallWebAddress } from '../common/is-small-web-address';
import { VIA_VALUES, Via } from './visit.schema';

export class RecordVisitDto {
  @IsString()
  @MaxLength(300)
  @IsSmallWebAddress()
  address!: string;

  @IsIn(VIA_VALUES as unknown as string[], { message: `via must be one of: ${VIA_VALUES.join(', ')}` })
  via!: Via;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  requestId?: string;
}

export interface VisitDto {
  id: string;
  address: string;
  title: string | null;
  at: string;
  via: Via;
  found: boolean;
}

export interface VisitPageDto {
  items: VisitDto[];
  nextCursor: string | null;
}
