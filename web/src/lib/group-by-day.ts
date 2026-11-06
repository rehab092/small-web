/**
 * Group a newest-first list of visits into day sections in the viewer's local
 * timezone, as a browser history page does.
 */

import type { VisitDto } from './types';

export interface DayGroup {
  /** Local calendar day, YYYY-MM-DD. */
  key: string;
  /** "Today", "Yesterday" or a long date. */
  label: string;
  items: VisitDto[];
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dayLabel(day: Date, now: Date): string {
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(day).getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return day.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Appends to existing groups, so it works as pages arrive from the API. */
export function groupVisitsByDay(visits: VisitDto[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const visit of visits) {
    const at = new Date(visit.at);
    const key = dayKey(at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(visit);
    } else {
      groups.push({ key, label: dayLabel(at, now), items: [visit] });
    }
  }
  return groups;
}

/** "14:05" in the viewer's timezone. */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
