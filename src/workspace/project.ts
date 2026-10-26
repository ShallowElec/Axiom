import { matrixFromRows } from '../core/matrix.js';
import type { Matrix, StoredMatrix } from '../core/matrix.js';
import { seedObjects } from '../content/library.js';
import type { SeedMatrixObject } from '../content/library.js';

export const STORAGE_KEY = 'matrix-atelier.workspace.v1';
export const STORE_VERSION = 2;

export interface SerializedMatrix {
  id: string;
  name: string;
  note: string;
  rows: number;
  cols: number;
  data: string[][];
}

export interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: number;
  objects: StoredMatrix[];
  expression: string;
  speed: number;
}

interface SerializedProject {
  id: string;
  name: string;
  updatedAt: number;
  matrices: SerializedMatrix[];
  expression: string;
  speed: number;
}

interface PersistedWorkspace {
  version: 2;
  activeProjectId: string;
  projects: SerializedProject[];
}

export function withShape<T extends { rows: number; cols: number }>(matrix: T): T & { shape: string } {
  return { ...matrix, shape: `${matrix.rows}×${matrix.cols}` };
}

export function makeProjectId(): string {
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function serializeObjects(objects: readonly StoredMatrix[]): SerializedMatrix[] {
  return objects.map((matrix) => ({
    id: matrix.id,
    name: matrix.name,
    note: matrix.note,
    rows: matrix.rows,
    cols: matrix.cols,
    data: matrix.data.map((row) => row.map((value) => value.toString())),
  }));
}

export function hydrateObjects(raw: unknown): StoredMatrix[] {
  if (!Array.isArray(raw) || !raw.length) throw new Error('没有可用的矩阵');
  const seen = new Set<string>();
  return raw.map((entry) => {
    const candidate = entry as Partial<SerializedMatrix>;
    if (!candidate || typeof candidate.name !== 'string' || !Array.isArray(candidate.data)) {
      throw new Error('矩阵数据损坏');
    }
    if (seen.has(candidate.name)) throw new Error(`矩阵名字重复：${candidate.name}`);
    seen.add(candidate.name);
    const matrix = matrixFromRows(candidate.data, candidate.name);
    return withShape({
      ...matrix,
      id: candidate.id || `restored-${candidate.name}-${Math.random().toString(36).slice(2, 7)}`,
      note: candidate.note || '恢复的矩阵对象',
    }) as StoredMatrix;
  });
}

export function seedWorkspaceObjects(): StoredMatrix[] {
  return seedObjects().map((object: SeedMatrixObject) => withShape(object)) as StoredMatrix[];
}

export function createProjectRecord(name = '线性代数 · 实验 01'): ProjectRecord {
  return {
    id: makeProjectId(),
    name,
    updatedAt: Date.now(),
    objects: seedWorkspaceObjects(),
    expression: 'A × B',
    speed: 1,
  };
}

function serializeProject(project: ProjectRecord): SerializedProject {
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    matrices: serializeObjects(project.objects),
    expression: project.expression,
    speed: project.speed,
  };
}

function hydrateProject(raw: unknown): ProjectRecord {
  const candidate = raw as Partial<SerializedProject> | null;
  if (!candidate || typeof candidate.id !== 'string' || typeof candidate.name !== 'string') {
    throw new Error('项目数据损坏');
  }
  return {
    id: candidate.id,
    name: candidate.name,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
    objects: hydrateObjects(candidate.matrices),
    expression: typeof candidate.expression === 'string' ? candidate.expression : 'A × B',
    speed: typeof candidate.speed === 'number' ? candidate.speed : 1,
  };
}

export interface LoadedProjects {
  projects: ProjectRecord[];
  activeProjectId: string;
}

function migrateLegacy(raw: Record<string, unknown>): LoadedProjects | null {
  if (!Array.isArray(raw.matrices) || !raw.matrices.length) return null;
  try {
    const objects = hydrateObjects(raw.matrices);
    const project: ProjectRecord = {
      id: makeProjectId(),
      name: '线性代数 · 实验 01',
      updatedAt: Date.now(),
      objects,
      expression: typeof raw.expression === 'string' ? raw.expression : 'A × B',
      speed: typeof raw.speed === 'number' ? raw.speed : 1,
    };
    return { projects: [project], activeProjectId: project.id };
  } catch {
    return null;
  }
}

export function loadProjects(): LoadedProjects {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Record<string, unknown> | null;
    if (raw && raw.version === STORE_VERSION && Array.isArray(raw.projects)) {
      const hydrated = (raw.projects as unknown[]).map(hydrateProject).filter((project) => project.objects.length);
      if (hydrated.length) {
        const activeProjectId =
          typeof raw.activeProjectId === 'string' && hydrated.some((project) => project.id === raw.activeProjectId)
            ? raw.activeProjectId
            : hydrated[0]!.id;
        return { projects: hydrated, activeProjectId };
      }
    }
    if (raw) {
      const migrated = migrateLegacy(raw);
      if (migrated) return migrated;
    }
  } catch {
    // corrupted workspaces fall back to a fresh seed project
  }
  const fresh = createProjectRecord();
  return { projects: [fresh], activeProjectId: fresh.id };
}

export function persistProjects(projects: readonly ProjectRecord[], activeProjectId: string): void {
  const payload: PersistedWorkspace = {
    version: 2,
    activeProjectId,
    projects: projects.map(serializeProject),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Local storage can be unavailable or full; the in-memory project still works.
  }
}

export function projectToExport(project: ProjectRecord): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    updatedAt: new Date(project.updatedAt).toISOString(),
    expression: project.expression,
    speed: project.speed,
    matrices: serializeObjects(project.objects),
  };
}

export function renameProject(project: ProjectRecord, name: string): ProjectRecord {
  return { ...project, name: name.trim() || project.name, updatedAt: Date.now() };
}

export function matrixObjects(projects: readonly ProjectRecord[]): Matrix[] {
  return projects.flatMap((project) => project.objects);
}
