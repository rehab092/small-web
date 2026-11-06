import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * A published page. Edit = replace: the address is the identity, the document
 * is overwritten in place and `revision` counts the replacements. Visits point
 * at the address, so history survives edits.
 *
 * Timestamps are managed by the service (not mongoose) so the seed can pin them.
 */
@Schema({ collection: 'sites', versionKey: false })
export class Site {
  @Prop({ required: true, unique: true }) address!: string;
  @Prop({ required: true }) title!: string;
  /** Sanitized HTML. The raw submission is never stored. */
  @Prop({ required: true }) html!: string;
  /** Plain text extracted from the body, for full-text search and snippets. */
  @Prop({ required: true }) text!: string;
  /** Author slug (see Person.slug). */
  @Prop({ required: true, index: true }) authorId!: string;
  @Prop({ required: true, default: 1 }) revision!: number;
  @Prop({ required: true }) createdAt!: Date;
  @Prop({ required: true }) updatedAt!: Date;
}

export type SiteDoc = HydratedDocument<Site>;
export const SiteSchema = SchemaFactory.createForClass(Site);

/** One text index; title outranks address outranks body. */
SiteSchema.index(
  { title: 'text', address: 'text', text: 'text' },
  { name: 'site_text', weights: { title: 10, address: 5, text: 1 }, default_language: 'english' },
);
