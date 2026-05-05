import { formatLocalDateTime } from './timezone';

type TournamentLike = {
  name?: string | null;
  startsAt?: string | number | Date | null;
};

const HOURLY_UTC_NAME = /^\s*(?:⚡\s*)?Hourly Blitz(?:\s+\d{1,2}:00\s+UTC)?\s*$/i;
const LEADING_TOURNAMENT_MARKS = /^(?:\s*(?:⚡|🏆|☀️|🔥|🐢|🎪|⭐|🎯)\s*)+/;

export function displayTournamentName(tournament: TournamentLike): string {
  const rawName = (tournament.name || 'Tournament').trim();
  if (HOURLY_UTC_NAME.test(rawName) && tournament.startsAt) {
    return `Hourly Blitz ${formatLocalDateTime(tournament.startsAt, { hour: '2-digit', minute: '2-digit' }, true)}`;
  }

  const cleanName = rawName.replace(LEADING_TOURNAMENT_MARKS, '').trim();
  return cleanName || rawName;
}
