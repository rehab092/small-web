import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Person, PersonRole } from './person.schema';

export interface PersonDto {
  id: string;
  name: string;
  roles: PersonRole[];
}

export const toPersonDto = (p: Pick<Person, 'slug' | 'name' | 'roles'>): PersonDto => ({
  id: p.slug,
  name: p.name,
  roles: p.roles,
});

@Injectable()
export class PeopleService implements OnModuleInit {
  constructor(@InjectModel(Person.name) private readonly model: Model<Person>) {}

  async onModuleInit() {
    await this.model.init();
  }

  async list(role?: PersonRole): Promise<PersonDto[]> {
    const rows = await this.model.find(role ? { roles: role } : {}).sort({ name: 1 }).lean();
    return rows.map(toPersonDto);
  }

  async get(id: string): Promise<PersonDto> {
    const row = await this.model.findOne({ slug: id }).lean();
    if (!row) throw new NotFoundException('person not found');
    return toPersonDto(row);
  }

  /** Map of slug → name, used to attach author names to sites. */
  async namesBySlug(slugs: string[]): Promise<Map<string, string>> {
    const rows = await this.model.find({ slug: { $in: [...new Set(slugs)] } }).lean();
    return new Map(rows.map((r) => [r.slug, r.name]));
  }

  async exists(id: string): Promise<boolean> {
    return (await this.model.exists({ slug: id })) !== null;
  }

  async hasRole(id: string, role: PersonRole): Promise<boolean> {
    return (await this.model.exists({ slug: id, roles: role })) !== null;
  }
}
