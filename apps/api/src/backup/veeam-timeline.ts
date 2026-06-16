type RawMetricsJson = Record<string, any> | string | null | undefined;

export type VeeamTimelineType = 'Backup' | 'Replica';
export type VeeamTimelineResult = 'Success' | 'Failed' | 'Warning' | 'Running' | 'Unknown';
export type VeeamTimelineTypeFilter = 'all' | VeeamTimelineType;
export type VeeamTimelineResultFilter = 'all' | VeeamTimelineResult;

type RawSession = {
  id?: string;
  jobId?: string;
  name?: string;
  sessionType?: string | number;
  state?: string;
  creationTime?: string;
  endTime?: string | null;
  progressPercent?: number;
  result?: {
    result?: string | null;
    message?: string | null;
    isCanceled?: boolean;
  };
};

type NormalizedSession = {
  id: string;
  jobId: string;
  name: string;
  type: VeeamTimelineType;
  state: string;
  start: Date;
  end: Date;
  result: VeeamTimelineResult;
  message: string;
  progressPercent: number | null;
};

type TimelineBucket = {
  label: string;
  start: string;
  end: string;
  active: boolean;
  result: '' | VeeamTimelineResult;
  title: string;
};

type TimelineRow = {
  jobId: string;
  name: string;
  type: VeeamTimelineType;
  overallResult: VeeamTimelineResult;
  sessionCount: number;
  firstStart: string;
  lastEnd: string;
  sessions: Array<{
    id: string;
    start: string;
    end: string;
    result: VeeamTimelineResult;
    message: string;
    progressPercent: number | null;
  }>;
  buckets: TimelineBucket[];
};

export type VeeamBackupTimeline = {
  meta: {
    source: string;
    date: string;
    timezone: string;
    bucketMinutes: number;
    bucketCount: number;
    rows: number;
    sessionsConsidered: number;
  };
  summary: {
    byType: Record<VeeamTimelineType, number>;
    byResult: Record<VeeamTimelineResult, number>;
  };
  rows: TimelineRow[];
  debug: {
    sessionsTotal: number;
    sessionsAfterTypeFilter: number;
    sessionsCrossingReportDate: number;
  };
};

type BuildTimelineInput = {
  metricsJson: RawMetricsJson;
  reportDate: string;
  bucketMinutes?: number;
  timezone?: string;
  typeFilter?: VeeamTimelineTypeFilter;
  resultFilter?: VeeamTimelineResultFilter;
  collectedAt?: Date | string | number | null;
};

const SOURCE_LABEL = 'Zabbix history item veeam.get.metrics';
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_BUCKET_MINUTES = 30;
const RESULT_PRIORITY: Record<VeeamTimelineResult, number> = {
  Unknown: 0,
  Success: 1,
  Running: 2,
  Warning: 3,
  Failed: 4,
};
const ALLOWED_TYPES = new Set(['BackupJob', 'ReplicaJob']);
const RUNNING_STATES = new Set(['working', 'running', 'postprocessing', 'starting', 'stopping']);

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getFormatter(timeZone: string, withSeconds = true) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12: false,
    hourCycle: 'h23',
  });
}

function getZonedParts(date: Date, timeZone: string) {
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);
  const localDate = new Date(date.getTime() + offsetMinutes * 60_000);
  return {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
    hour: localDate.getUTCHours(),
    minute: localDate.getUTCMinutes(),
    second: localDate.getUTCSeconds(),
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const tz = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  const match = tz.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function zonedTimeToUtc(date: string, timeZone: string, hour = 0, minute = 0, second = 0): Date {
  const [yearRaw, monthRaw, dayRaw] = String(date || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMinutes(new Date(utcGuess), timeZone);
    utcGuess = Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000;
  }
  return new Date(utcGuess);
}

function getNextDateString(date: string): string {
  const [yearRaw, monthRaw, dayRaw] = String(date || '').split('-');
  const next = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw) + 1));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function formatIsoInTimeZone(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(abs / 60);
  const offsetRemainder = abs % 60;
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}${sign}${pad2(offsetHours)}:${pad2(offsetRemainder)}`;
}

function formatTimeLabel(date: Date, timeZone: string, withSeconds = false): string {
  const parts = getZonedParts(date, timeZone);
  return withSeconds
    ? `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`
    : `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function parseMetricsJson(metricsJson: RawMetricsJson): Record<string, any> {
  if (!metricsJson) return {};
  if (typeof metricsJson === 'string') {
    return JSON.parse(metricsJson);
  }
  if (typeof metricsJson === 'object') return metricsJson;
  return {};
}

export function extractVeeamSessions(metricsJson: RawMetricsJson): RawSession[] {
  const parsed = parseMetricsJson(metricsJson);
  const sessions = parsed?.sessions?.data;
  return Array.isArray(sessions) ? sessions : [];
}

export function normalizeVeeamType(sessionType?: string | number | null): VeeamTimelineType | null {
  const normalized = String(sessionType ?? '').trim();
  if (normalized === 'BackupJob') return 'Backup';
  if (normalized === 'ReplicaJob') return 'Replica';
  return null;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseCollectedAt(value?: Date | string | number | null): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    return parseDate(new Date(millis).toISOString());
  }
  if (typeof value === 'string' && value.trim()) return parseDate(value);
  return null;
}

function isRunningState(state?: string | null): boolean {
  return RUNNING_STATES.has(String(state || '').trim().toLowerCase());
}

export function normalizeVeeamResult(session: RawSession): VeeamTimelineResult {
  const state = String(session?.state || '').trim();
  const rawResult = String(session?.result?.result || '').trim();
  if (!session?.endTime && state.toLowerCase() !== 'stopped') return 'Running';
  if (rawResult.toLowerCase() === 'none' && state.toLowerCase() !== 'stopped') return 'Running';
  if (rawResult.toLowerCase() === 'success') return 'Success';
  if (rawResult.toLowerCase() === 'failed' || rawResult.toLowerCase() === 'error') return 'Failed';
  if (rawResult.toLowerCase() === 'warning') return 'Warning';
  if (!rawResult) return 'Unknown';
  return 'Unknown';
}

function clampDate(date: Date, min: Date, max: Date): Date {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function toNormalizedSession(
  raw: RawSession,
  dayStart: Date,
  dayEnd: Date,
  collectedAt: Date,
): NormalizedSession | null {
  const sessionType = String(raw?.sessionType ?? '').trim();
  if (!ALLOWED_TYPES.has(sessionType)) return null;
  const type = normalizeVeeamType(raw?.sessionType);
  if (!type) return null;
  const start = parseDate(raw?.creationTime);
  if (!start) return null;
  const rawEnd = parseDate(raw?.endTime);
  const fallbackEnd = collectedAt > dayEnd ? dayEnd : collectedAt;
  const computedEnd = rawEnd || (!String(raw?.state || '').trim().toLowerCase().includes('stopped') ? fallbackEnd : start);
  const clampedStart = clampDate(start, dayStart, dayEnd);
  const clampedEnd = clampDate(computedEnd, dayStart, dayEnd);
  const sessionEnd = clampedEnd > clampedStart ? clampedEnd : clampedStart;
  return {
    id: String(raw?.id || `${raw?.jobId || 'no-job'}:${raw?.name || 'session'}:${start.toISOString()}`),
    jobId: String(raw?.jobId || ''),
    name: String(raw?.name || 'Sem nome'),
    type,
    state: String(raw?.state || ''),
    start,
    end: sessionEnd,
    result: normalizeVeeamResult(raw),
    message: String(raw?.result?.message || raw?.result?.result || raw?.state || ''),
    progressPercent: Number.isFinite(Number(raw?.progressPercent)) ? Number(raw?.progressPercent) : null,
  };
}

function sessionOverlapsRange(sessionStart: Date, sessionEnd: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return sessionStart < rangeEnd && sessionEnd > rangeStart;
}

function pickMostSevereResult(results: VeeamTimelineResult[]): VeeamTimelineResult {
  if (results.length === 0) return 'Unknown';
  return [...results].sort((a, b) => RESULT_PRIORITY[b] - RESULT_PRIORITY[a])[0];
}

export function generateDayBuckets(reportDate: string, bucketMinutes: number, timeZone: string): Array<{ label: string; start: Date; end: Date }> {
  const dayStart = zonedTimeToUtc(reportDate, timeZone);
  const dayEnd = zonedTimeToUtc(getNextDateString(reportDate), timeZone);
  const buckets: Array<{ label: string; start: Date; end: Date }> = [];
  const bucketMs = bucketMinutes * 60_000;
  for (let cursor = dayStart.getTime(); cursor < dayEnd.getTime(); cursor += bucketMs) {
    const start = new Date(cursor);
    const end = new Date(Math.min(cursor + bucketMs, dayEnd.getTime()));
    buckets.push({ label: formatTimeLabel(start, timeZone), start, end });
  }
  return buckets;
}

function buildBucketTitle(name: string, type: VeeamTimelineType, sessions: NormalizedSession[], timeZone: string): string {
  if (sessions.length === 0) return '';
  return sessions.map((session) => {
    const start = formatTimeLabel(session.start, timeZone, true);
    const end = formatTimeLabel(session.end, timeZone, true);
    const progress = session.progressPercent != null ? ` | ${session.progressPercent}%` : '';
    const message = session.message ? ` | ${session.message}` : '';
    return `${name} | ${type} | ${start} - ${end} | ${session.result}${progress}${message}`;
  }).join('\n');
}

function sortRows(a: TimelineRow, b: TimelineRow): number {
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return a.name.localeCompare(b.name);
}

export function buildVeeamBackupTimeline(input: BuildTimelineInput): VeeamBackupTimeline {
  const bucketMinutes = [15, 30, 60].includes(Number(input.bucketMinutes)) ? Number(input.bucketMinutes) : DEFAULT_BUCKET_MINUTES;
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const typeFilter = input.typeFilter || 'all';
  const resultFilter = input.resultFilter || 'all';
  const dayStart = zonedTimeToUtc(input.reportDate, timezone);
  const dayEnd = zonedTimeToUtc(getNextDateString(input.reportDate), timezone);
  const collectedAt = parseCollectedAt(input.collectedAt) || dayEnd;
  const rawSessions = extractVeeamSessions(input.metricsJson);
  const normalizedSessions = rawSessions
    .map((session) => toNormalizedSession(session, dayStart, dayEnd, collectedAt))
    .filter((session): session is NormalizedSession => !!session);
  const buckets = generateDayBuckets(input.reportDate, bucketMinutes, timezone);
  const crossingReportDate = normalizedSessions.filter((session) =>
    sessionOverlapsRange(session.start, session.end, dayStart, dayEnd),
  );
  const considered = crossingReportDate.filter((session) => {
    if (typeFilter !== 'all' && session.type !== typeFilter) return false;
    if (resultFilter !== 'all' && session.result !== resultFilter) return false;
    return true;
  });

  const grouped = new Map<string, NormalizedSession[]>();
  for (const session of considered) {
    const key = session.jobId || `${session.type}:${session.name}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(session);
  }

  const rows: TimelineRow[] = Array.from(grouped.entries()).map(([key, groupSessions]) => {
    const sortedSessions = [...groupSessions].sort((a, b) => a.start.getTime() - b.start.getTime());
    const firstStart = sortedSessions[0].start;
    const lastEnd = sortedSessions.reduce((max, item) => item.end > max ? item.end : max, sortedSessions[0].end);
    const rowName = sortedSessions[0].name;
    const rowType = sortedSessions[0].type;
    const overallResult = pickMostSevereResult(sortedSessions.map((session) => session.result));
    const rowBuckets: TimelineBucket[] = buckets.map((bucket) => {
      const activeSessions = sortedSessions.filter((session) => sessionOverlapsRange(session.start, session.end, bucket.start, bucket.end));
      const bucketResult = activeSessions.length > 0 ? pickMostSevereResult(activeSessions.map((session) => session.result)) : '';
      return {
        label: bucket.label,
        start: formatIsoInTimeZone(bucket.start, timezone),
        end: formatIsoInTimeZone(bucket.end, timezone),
        active: activeSessions.length > 0,
        result: bucketResult,
        title: buildBucketTitle(rowName, rowType, activeSessions, timezone),
      };
    });
    return {
      jobId: sortedSessions[0].jobId || key,
      name: rowName,
      type: rowType,
      overallResult,
      sessionCount: sortedSessions.length,
      firstStart: formatIsoInTimeZone(firstStart, timezone),
      lastEnd: formatIsoInTimeZone(lastEnd, timezone),
      sessions: sortedSessions.map((session) => ({
        id: session.id,
        start: formatIsoInTimeZone(session.start, timezone),
        end: formatIsoInTimeZone(session.end, timezone),
        result: session.result,
        message: session.message,
        progressPercent: session.progressPercent,
      })),
      buckets: rowBuckets,
    };
  }).sort(sortRows);

  const summary = {
    byType: { Backup: 0, Replica: 0 } as Record<VeeamTimelineType, number>,
    byResult: { Success: 0, Failed: 0, Warning: 0, Running: 0, Unknown: 0 } as Record<VeeamTimelineResult, number>,
  };
  for (const session of considered) {
    summary.byType[session.type] += 1;
    summary.byResult[session.result] += 1;
  }

  return {
    meta: {
      source: SOURCE_LABEL,
      date: input.reportDate,
      timezone,
      bucketMinutes,
      bucketCount: buckets.length,
      rows: rows.length,
      sessionsConsidered: considered.length,
    },
    summary,
    rows,
    debug: {
      sessionsTotal: rawSessions.length,
      sessionsAfterTypeFilter: normalizedSessions.length,
      sessionsCrossingReportDate: crossingReportDate.length,
    },
  };
}

export function validateVeeamBackupTimelineMock(): { ok: boolean; details: string[] } {
  const metricsJson = {
    proxies: [],
    managedServers: [],
    repositories_states: [],
    jobs_states: [],
    sessions: {
      data: [
        {
          id: 's1',
          jobId: 'job-backup',
          name: 'NAS-TECNOTEMPERA',
          sessionType: 'BackupJob',
          state: 'Stopped',
          creationTime: '2026-06-15T04:00:02-03:00',
          endTime: '2026-06-15T09:05:04-03:00',
          progressPercent: 100,
          result: { result: 'Success', message: 'Success' },
        },
        {
          id: 's2',
          jobId: 'job-replica',
          name: 'Replica-SRV-01',
          sessionType: 'ReplicaJob',
          state: 'Stopped',
          creationTime: '2026-06-14T23:50:00-03:00',
          endTime: '2026-06-15T00:40:00-03:00',
          progressPercent: 100,
          result: { result: 'Failed', message: 'Falha de link' },
        },
        {
          id: 's3',
          jobId: 'job-running',
          name: 'NAS-EM-EXECUCAO',
          sessionType: 'BackupJob',
          state: 'Postprocessing',
          creationTime: '2026-06-15T10:00:00-03:00',
          endTime: null,
          progressPercent: 99,
          result: { result: 'None', message: '' },
        },
        {
          id: 'ignored-admin',
          jobId: 'job-admin',
          name: 'Configuration Backup',
          sessionType: 'ConfigurationBackup',
          state: 'Stopped',
          creationTime: '2026-06-15T03:00:00-03:00',
          endTime: '2026-06-15T03:05:00-03:00',
          result: { result: 'Success', message: 'Success' },
        },
        {
          id: 'ignored-numeric',
          name: 'Infra Job',
          sessionType: 32,
          state: 'Stopped',
          creationTime: '2026-06-15T03:00:00-03:00',
          endTime: '2026-06-15T03:05:00-03:00',
          result: { result: 'Success', message: 'Success' },
        },
      ],
    },
  };
  const timeline = buildVeeamBackupTimeline({
    metricsJson,
    reportDate: '2026-06-15',
    bucketMinutes: 30,
    timezone: 'America/Sao_Paulo',
    collectedAt: '2026-06-16T00:10:00-03:00',
  });
  const details: string[] = [];
  if (timeline.meta.bucketCount !== 48) details.push('bucketCount deve ser 48 para escala de 30 minutos');
  if (timeline.debug.sessionsTotal !== 5) details.push('total de sessoes do JSON deveria ser 5');
  if (timeline.debug.sessionsAfterTypeFilter !== 3) details.push('deve ignorar sessoes administrativas e tipos numericos');
  if (timeline.meta.sessionsConsidered !== 3) details.push('deve considerar 3 sessoes no dia selecionado');
  const backupRow = timeline.rows.find((row) => row.jobId === 'job-backup');
  if (!backupRow) {
    details.push('linha do job de backup nao encontrada');
  } else if (backupRow.buckets.find((bucket) => bucket.label === '04:00')?.result !== 'Success') {
    details.push('bucket 04:00 deveria ficar Success');
  }
  const replicaRow = timeline.rows.find((row) => row.jobId === 'job-replica');
  if (!replicaRow?.buckets.find((bucket) => bucket.label === '00:00')?.active) details.push('sessao cruzando meia-noite deveria ativar bucket 00:00');
  const runningRow = timeline.rows.find((row) => row.jobId === 'job-running');
  if (runningRow?.overallResult !== 'Running') details.push('sessao Postprocessing sem endTime deveria ficar Running');
  if (runningRow?.sessions[0]?.progressPercent !== 99) details.push('progressPercent deveria ser preservado');
  return { ok: details.length === 0, details };
}
