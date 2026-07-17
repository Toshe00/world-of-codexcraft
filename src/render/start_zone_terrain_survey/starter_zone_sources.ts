import { MAILBOXES } from '../../sim/content/mailboxes';
import { getActiveWorldContent } from '../../sim/data';
import type { ProtectedZone, TerrainSurveyBounds, TerrainSurveyZoneDescription } from './terrain_survey_core';

const SURVEY_MARGIN_METERS = 12;
const SURVEY_ALIGNMENT_METERS = 5;
const ROAD_PROTECTED_RADIUS = 5;
const NPC_PROTECTED_RADIUS = 2.5;
const QUEST_POINT_RADIUS = 1.5;
const ENTRANCE_PROTECTED_RADIUS = 2;

export interface StarterZoneEntitySnapshot {
  kind: string;
  templateId: string;
  name: string;
  pos: { x: number; y: number; z: number };
}

export interface StarterZoneSurveySource {
  zone: TerrainSurveyZoneDescription;
  protectedZones: ProtectedZone[];
}

function inBounds(x: number, z: number, bounds: TerrainSurveyBounds): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

function segmentOverlapsBounds(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  bounds: TerrainSurveyBounds,
): boolean {
  return !(
    Math.max(x1, x2) < bounds.minX ||
    Math.min(x1, x2) > bounds.maxX ||
    Math.max(z1, z2) < bounds.minZ ||
    Math.min(z1, z2) > bounds.maxZ
  );
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

export function buildStarterZoneSurveySource(
  liveEntities: readonly StarterZoneEntitySnapshot[],
): StarterZoneSurveySource {
  const content = getActiveWorldContent();
  const playerStart = content.playerStart;
  const zone =
    content.zones.find((candidate) => playerStart.z >= candidate.zMin && playerStart.z <= candidate.zMax) ??
    content.zones[0];
  if (!zone) throw new RangeError('active world has no starter zone');
  const halfExtent =
    Math.ceil((zone.hub.radius * 2 + SURVEY_MARGIN_METERS) / SURVEY_ALIGNMENT_METERS) *
    SURVEY_ALIGNMENT_METERS;
  const bounds: TerrainSurveyBounds = {
    minX: zone.hub.x - halfExtent,
    maxX: zone.hub.x + halfExtent,
    minZ: zone.hub.z - halfExtent,
    maxZ: zone.hub.z + halfExtent,
  };
  const surveyZone: TerrainSurveyZoneDescription = {
    id: `${zone.id}-starter-village`,
    name: zone.hub.name,
    center: { x: zone.hub.x, z: zone.hub.z },
    bounds,
  };
  const protectedZones: ProtectedZone[] = [];

  content.props.buildings.forEach((building, index) => {
    if (!inBounds(building.x, building.z, bounds)) return;
    const id = `${building.kind}-${String(index + 1).padStart(2, '0')}`;
    protectedZones.push({
      id: `building-${id}`,
      name: `${building.kind} ${index + 1}`,
      kind: 'building',
      shape: 'rectangle',
      x: building.x,
      z: building.z,
      width: building.w + 1,
      depth: building.d + 1,
      rotationY: building.rot,
    });
    protectedZones.push({
      id: `building-entrance-${id}`,
      name: `${building.kind} ${index + 1} entrance`,
      kind: 'building-entrance',
      shape: 'circle',
      x: building.x + Math.sin(building.rot) * (building.d / 2),
      z: building.z + Math.cos(building.rot) * (building.d / 2),
      radius: ENTRANCE_PROTECTED_RADIUS,
    });
  });

  content.props.wells.forEach((well, index) => {
    if (!inBounds(well.x, well.z, bounds)) return;
    protectedZones.push({
      id: `well-${String(index + 1).padStart(2, '0')}`,
      name: `Well ${index + 1}`,
      kind: 'well',
      shape: 'circle',
      x: well.x,
      z: well.z,
      radius: well.r + 1,
    });
  });

  content.props.campfires.forEach(([x, z], index) => {
    if (!inBounds(x, z, bounds)) return;
    protectedZones.push({
      id: `campfire-${String(index + 1).padStart(2, '0')}`,
      name: `Campfire ${index + 1}`,
      kind: 'campfire',
      shape: 'circle',
      x,
      z,
      radius: 3,
    });
  });

  for (const [roadIndex, road] of content.roads.entries()) {
    for (let segmentIndex = 0; segmentIndex < road.length - 1; segmentIndex++) {
      const start = road[segmentIndex];
      const end = road[segmentIndex + 1];
      if (!start || !end || !segmentOverlapsBounds(start.x, start.z, end.x, end.z, bounds)) continue;
      protectedZones.push({
        id: `road-${String(roadIndex + 1).padStart(2, '0')}-${String(segmentIndex + 1).padStart(2, '0')}`,
        name: `Main road ${roadIndex + 1}, segment ${segmentIndex + 1}`,
        kind: 'road',
        shape: 'corridor',
        x1: start.x,
        z1: start.z,
        x2: end.x,
        z2: end.z,
        radius: ROAD_PROTECTED_RADIUS,
      });
    }
  }

  for (const marker of content.props.delveMarkers ?? []) {
    if (!inBounds(marker.x, marker.z, bounds)) continue;
    protectedZones.push({
      id: `portal-${slug(marker.delveId)}`,
      name: marker.delveId,
      kind: 'portal',
      shape: 'circle',
      x: marker.x,
      z: marker.z,
      radius: 5,
    });
  }

  for (const [index, mailbox] of MAILBOXES.entries()) {
    if (!inBounds(mailbox.x, mailbox.z, bounds)) continue;
    protectedZones.push({
      id: `mailbox-${String(index + 1).padStart(2, '0')}`,
      name: `Mailbox ${index + 1}`,
      kind: 'mailbox',
      shape: 'circle',
      x: mailbox.x,
      z: mailbox.z,
      radius: 2,
    });
  }

  protectedZones.push({
    id: 'spawn-player-start',
    name: 'Player start',
    kind: 'spawn-point',
    shape: 'circle',
    x: playerStart.x,
    z: playerStart.z,
    radius: 4,
  });

  for (const groundObject of content.groundObjects) {
    for (const [index, position] of groundObject.positions.entries()) {
      if (!inBounds(position.x, position.z, bounds)) continue;
      protectedZones.push({
        id: `quest-object-${slug(groundObject.itemId)}-${String(index + 1).padStart(2, '0')}`,
        name: groundObject.name,
        kind: 'quest-point',
        shape: 'circle',
        x: position.x,
        z: position.z,
        radius: QUEST_POINT_RADIUS,
      });
    }
  }

  const liveNpcTemplateIds = new Set<string>();
  for (const entity of liveEntities) {
    if (entity.kind !== 'npc' || !inBounds(entity.pos.x, entity.pos.z, bounds)) continue;
    liveNpcTemplateIds.add(entity.templateId);
    const definition = content.npcs[entity.templateId];
    const merchant = Boolean(
      definition?.market || definition?.banker || (definition?.vendorItems?.length ?? 0) > 0,
    );
    protectedZones.push({
      id: `${merchant ? 'merchant' : 'npc'}-${slug(entity.templateId)}`,
      name: entity.name,
      kind: merchant ? 'merchant' : 'npc',
      shape: 'circle',
      x: entity.pos.x,
      z: entity.pos.z,
      radius: NPC_PROTECTED_RADIUS,
    });
    if ((definition?.questIds.length ?? 0) > 0) {
      protectedZones.push({
        id: `quest-giver-${slug(entity.templateId)}`,
        name: `${entity.name} quest point`,
        kind: 'quest-point',
        shape: 'circle',
        x: entity.pos.x,
        z: entity.pos.z,
        radius: QUEST_POINT_RADIUS,
      });
    }
  }

  for (const definition of Object.values(content.npcs)) {
    if (
      definition.dynamic ||
      liveNpcTemplateIds.has(definition.id) ||
      !inBounds(definition.pos.x, definition.pos.z, bounds)
    ) {
      continue;
    }
    const merchant = Boolean(
      definition.market || definition.banker || (definition.vendorItems?.length ?? 0) > 0,
    );
    protectedZones.push({
      id: `${merchant ? 'merchant' : 'npc'}-${slug(definition.id)}`,
      name: definition.name,
      kind: merchant ? 'merchant' : 'npc',
      shape: 'circle',
      x: definition.pos.x,
      z: definition.pos.z,
      radius: NPC_PROTECTED_RADIUS,
    });
    if (definition.questIds.length > 0) {
      protectedZones.push({
        id: `quest-giver-${slug(definition.id)}`,
        name: `${definition.name} quest point`,
        kind: 'quest-point',
        shape: 'circle',
        x: definition.pos.x,
        z: definition.pos.z,
        radius: QUEST_POINT_RADIUS,
      });
    }
  }

  return {
    zone: surveyZone,
    protectedZones: protectedZones.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

