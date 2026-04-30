/**
 * Calendar export — generate a `.ics` (iCalendar RFC 5545) string from a plan
 * and trigger the OS to handle it. Tapping the file pops the user's calendar
 * app (Google Cal, Apple Cal, Outlook…) with the event prefilled.
 *
 * On web : we trigger a Blob download. On native : we share via the platform
 * Share API (the user picks Calendar from the destination list).
 */

import { Platform, Share, Alert } from 'react-native';

interface IcsInput {
  title: string;
  /** ISO 8601 start. */
  startISO: string;
  /** Duration in minutes. Defaults to 120 (2h) — sensible for a plan. */
  durationMinutes?: number;
  /** Free-text description (rendered on the event detail). */
  description?: string;
  /** Geographic location string (typically the first place's address). */
  location?: string;
}

/**
 * Format a Date as RFC 5545 floating UTC stamp : YYYYMMDDTHHMMSSZ.
 * No separators, trailing 'Z'.
 */
const formatIcsStamp = (d: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
};

/** Escape ICS text fields per RFC 5545 §3.3.11 (no semis, commas, backslashes raw). */
const escapeIcsText = (raw: string): string =>
  raw
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');

/**
 * Build the .ics body. UID is a stable per-event hash so re-importing the
 * same event updates rather than duplicates in the user's calendar.
 */
export const buildIcs = (input: IcsInput): string => {
  const start = new Date(input.startISO);
  const duration = (input.durationMinutes ?? 120) * 60_000;
  const end = new Date(start.getTime() + duration);
  const stamp = formatIcsStamp(new Date());
  const uid = `proof-${start.getTime()}-${input.title.length}@proof.app`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Proof//Plan//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatIcsStamp(start)}`,
    `DTEND:${formatIcsStamp(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    input.location ? `LOCATION:${escapeIcsText(input.location)}` : '',
    input.description ? `DESCRIPTION:${escapeIcsText(input.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
};

/**
 * Trigger the calendar export. On web : Blob download (.ics). On native :
 * Share API with the .ics content as text (most calendar apps accept paste).
 *
 * Caller should already have validated that startISO is set — fails with an
 * Alert otherwise so the UI flow is safe.
 */
export const exportToCalendar = async (input: IcsInput): Promise<void> => {
  if (!input.startISO || Number.isNaN(new Date(input.startISO).getTime())) {
    Alert.alert('Pas de date', 'Ce plan n\'a pas encore de date de rendez-vous.');
    return;
  }
  const ics = buildIcs(input);

  if (Platform.OS === 'web') {
    try {
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${input.title.replace(/[^\w-]/g, '_').slice(0, 40)}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer the revoke a tick so the click had time to consume the URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.warn('[calendarExport] web download failed:', err);
      Alert.alert('Oups', 'Impossible de générer le fichier .ics.');
    }
    return;
  }

  // Native — share the .ics content. iOS will offer Calendar as a target
  // since text/calendar is registered. Android handling depends on installed
  // calendar apps but works on most setups.
  try {
    await Share.share({
      title: input.title,
      message: ics,
    });
  } catch (err) {
    console.warn('[calendarExport] Share failed:', err);
  }
};
