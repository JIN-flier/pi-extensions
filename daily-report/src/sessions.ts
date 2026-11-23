export interface TimestampedEntry {
  id: string;
  type: string;
  timestamp: string;
}

export interface SessionMetadata {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: Date;
  modified: Date;
}

export interface SessionSource<T extends TimestampedEntry> {
  listAll(): Promise<SessionMetadata[]>;
  open(path: string): { getBranch(): T[]; getEntries(): T[] };
}

export interface SessionCandidate<T extends TimestampedEntry> {
  info: SessionMetadata;
  entries: T[];
}

export async function discoverSessions<T extends TimestampedEntry>(
  source: SessionSource<T>,
  range: { from: Date; to: Date },
  allBranches: boolean,
  onError?: (path: string, error: unknown) => void,
): Promise<SessionCandidate<T>[]> {
  const from = range.from.getTime();
  const to = range.to.getTime();
  const infos = await source.listAll();
  const candidates = infos.filter(
    (info) => info.created.getTime() < to && info.modified.getTime() >= from,
  );
  const result: SessionCandidate<T>[] = [];
  for (const info of candidates) {
    try {
      const manager = source.open(info.path);
      const entries = (
        allBranches ? manager.getEntries() : manager.getBranch()
      ).filter((entry) => {
        const timestamp = Date.parse(entry.timestamp);
        return (
          Number.isFinite(timestamp) && timestamp >= from && timestamp < to
        );
      });
      if (entries.length) result.push({ info, entries });
    } catch (error) {
      if (!onError) throw error;
      onError(info.path, error);
    }
  }
  return result;
}
