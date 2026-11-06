import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PersonRole = 'browser' | 'author';

@Schema({ collection: 'people', versionKey: false })
export class Person {
  /** Stable public id, e.g. "ines-varga". */
  @Prop({ required: true, unique: true }) slug!: string;
  @Prop({ required: true, unique: true }) name!: string;
  @Prop({ type: [String], default: ['browser'] }) roles!: PersonRole[];
}

export type PersonDoc = HydratedDocument<Person>;
export const PersonSchema = SchemaFactory.createForClass(Person);
