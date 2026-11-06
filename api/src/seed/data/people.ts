import type { PersonRole } from '../../people/person.schema';

export interface SeedPerson {
  slug: string;
  name: string;
  roles: PersonRole[];
}

/** Four authors (three with more than one site) and one reader who only browses. */
export const SEED_PEOPLE: SeedPerson[] = [
  { slug: 'ines-varga', name: 'Ines Varga', roles: ['browser', 'author'] },
  { slug: 'tomas-reyes', name: 'Tomas Reyes', roles: ['browser', 'author'] },
  { slug: 'wen-zhao', name: 'Wen Zhao', roles: ['browser', 'author'] },
  { slug: 'odile-mercier', name: 'Odile Mercier', roles: ['browser', 'author'] },
  { slug: 'kofi-mensah', name: 'Kofi Mensah', roles: ['browser'] },
];
