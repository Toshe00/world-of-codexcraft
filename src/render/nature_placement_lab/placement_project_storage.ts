import {
  cloneNaturePlacementProject,
  NATURE_PLACEMENT_PROJECT_LIMITS,
  type NaturePlacementProject,
} from './placement_project_core';
import { validateNaturePlacementProject } from './placement_project_json';

export const NATURE_PLACEMENT_PROJECTS_KEY = 'dev.nature-placement-lab.projects.v2';
const STORAGE_VERSION = 1;

export interface NaturePlacementProjectStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredProjects {
  version: typeof STORAGE_VERSION;
  activeProjectId: string | null;
  projects: NaturePlacementProject[];
}

function emptyStore(): StoredProjects {
  return { version: STORAGE_VERSION, activeProjectId: null, projects: [] };
}

function readStore(storage: NaturePlacementProjectStorage | null): StoredProjects {
  if (!storage) return emptyStore();
  try {
    const parsed = JSON.parse(storage.getItem(NATURE_PLACEMENT_PROJECTS_KEY) ?? 'null') as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return emptyStore();
    const record = parsed as Record<string, unknown>;
    if (record.version !== STORAGE_VERSION || !Array.isArray(record.projects)) return emptyStore();
    if (record.projects.length > NATURE_PLACEMENT_PROJECT_LIMITS.maxProjects) return emptyStore();
    const ids = new Set<string>();
    const projects = record.projects.map((project) => {
      const validated = validateNaturePlacementProject(project, ids);
      ids.add(validated.projectId);
      return validated;
    });
    const activeProjectId =
      typeof record.activeProjectId === 'string' && ids.has(record.activeProjectId)
        ? record.activeProjectId
        : null;
    return { version: STORAGE_VERSION, activeProjectId, projects };
  } catch {
    return emptyStore();
  }
}

function canonicalStore(store: StoredProjects): StoredProjects {
  return {
    version: STORAGE_VERSION,
    activeProjectId: store.activeProjectId,
    projects: store.projects
      .map(cloneNaturePlacementProject)
      .sort((left, right) => left.projectId.localeCompare(right.projectId)),
  };
}

export class NaturePlacementProjectStore {
  private store: StoredProjects;

  constructor(private readonly storage: NaturePlacementProjectStorage | null) {
    this.store = readStore(storage);
  }

  get activeProjectId(): string | null {
    return this.store.activeProjectId;
  }

  list(): NaturePlacementProject[] {
    return this.store.projects.map(cloneNaturePlacementProject);
  }

  projectIds(): Set<string> {
    return new Set(this.store.projects.map((project) => project.projectId));
  }

  get(projectId: string): NaturePlacementProject | null {
    const project = this.store.projects.find((entry) => entry.projectId === projectId);
    return project ? cloneNaturePlacementProject(project) : null;
  }

  loadActive(): NaturePlacementProject | null {
    return this.store.activeProjectId ? this.get(this.store.activeProjectId) : null;
  }

  save(project: NaturePlacementProject, makeActive = true): boolean {
    const previous = canonicalStore(this.store);
    const existingIndex = this.store.projects.findIndex(
      (entry) => entry.projectId === project.projectId,
    );
    if (
      existingIndex < 0 &&
      this.store.projects.length >= NATURE_PLACEMENT_PROJECT_LIMITS.maxProjects
    ) {
      return false;
    }
    try {
      const ids = this.projectIds();
      if (existingIndex >= 0) ids.delete(project.projectId);
      const validated = validateNaturePlacementProject(project, ids);
      if (existingIndex >= 0) this.store.projects[existingIndex] = validated;
      else this.store.projects.push(validated);
      if (makeActive) this.store.activeProjectId = validated.projectId;
      if (this.flush()) return true;
      this.store = previous;
      return false;
    } catch {
      this.store = previous;
      return false;
    }
  }

  setActive(projectId: string): boolean {
    if (!this.store.projects.some((project) => project.projectId === projectId)) return false;
    const previous = canonicalStore(this.store);
    this.store.activeProjectId = projectId;
    if (this.flush()) return true;
    this.store = previous;
    return false;
  }

  rename(projectId: string, name: string, modifiedAt: string): NaturePlacementProject | null {
    const project = this.get(projectId);
    if (!project) return null;
    project.name = name;
    project.modifiedAt = modifiedAt;
    return this.save(project) ? project : null;
  }

  delete(projectId: string): boolean {
    const index = this.store.projects.findIndex((project) => project.projectId === projectId);
    if (index < 0) return false;
    const previous = canonicalStore(this.store);
    this.store.projects.splice(index, 1);
    if (this.store.activeProjectId === projectId) {
      this.store.activeProjectId = this.store.projects[0]?.projectId ?? null;
    }
    if (this.flush()) return true;
    this.store = previous;
    return false;
  }

  private flush(): boolean {
    if (!this.storage) return false;
    try {
      const canonical = canonicalStore(this.store);
      this.storage.setItem(NATURE_PLACEMENT_PROJECTS_KEY, JSON.stringify(canonical));
      this.store = canonical;
      return true;
    } catch {
      return false;
    }
  }
}
