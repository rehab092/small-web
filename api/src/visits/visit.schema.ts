import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const VIA_VALUES = ['typed', 'link', 'back', 'forward', 'history', 'search'] as const;
export type Via = (typeof VIA_VALUES)[number];

/** A recorded arrival. History is derived from these; there is no separate history store. */
@Schema({ collection: 'visits', versionKey: false })
export class Visit {
  /** Person slug. */
  @Prop({ required: true }) personId!: string;
  @Prop({ required: true }) address!: string;
  @Prop({ required: true }) at!: Date;
  @Prop({ type: String, required: true, enum: VIA_VALUES }) via!: Via;
  @Prop({ required: true }) found!: boolean;
  /** Client-generated idempotency key; unique per person when present. */
  @Prop() requestId?: string;
}

export type VisitDoc = HydratedDocument<Visit>;
export const VisitSchema = SchemaFactory.createForClass(Visit);

/** Newest-first history paging. */
VisitSchema.index({ personId: 1, at: -1, _id: -1 });
/** Idempotent recording: a repeated requestId can never create a second visit. */
VisitSchema.index(
  { personId: 1, requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: 'string' } }, name: 'visit_request_id' },
);
