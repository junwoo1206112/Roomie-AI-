export const FURNITURE_CATALOG = {
  bed: { name: '침대', width: 1.5, depth: 2, color: '#879184', icon: 'BED' },
  sofa: { name: '소파', width: 2, depth: 0.85, color: '#707c6e', icon: 'SOFA' },
  desk: { name: '책상', width: 1.2, depth: 0.6, color: '#b78c64', icon: 'DESK' },
  chair: { name: '의자', width: 0.6, depth: 0.6, color: '#657568', icon: 'CHAIR' },
  storage: { name: '수납장', width: 0.9, depth: 0.45, color: '#59615f', icon: 'STORAGE' },
  table: { name: '테이블', width: 1.2, depth: 0.7, color: '#c6a37d', icon: 'TABLE' },
  plant: { name: '식물', width: 0.45, depth: 0.45, color: '#586a52', icon: 'PLANT' }
};

export const ROOM_FURNITURE = {
  living: ['sofa', 'table', 'storage', 'plant'],
  bedroom: ['bed', 'storage', 'desk', 'chair'],
  studio: ['bed', 'desk', 'chair', 'storage', 'plant'],
  office: ['desk', 'chair', 'storage', 'plant']
};

const STRATEGIES = [
  { id: 'flow', name: '넓은 동선', description: '출입구와 중앙 통로를 가장 넓게 확보합니다.' },
  { id: 'balanced', name: '균형 배치', description: '채광, 사용 거리, 시각적 균형을 함께 고려합니다.' },
  { id: 'compact', name: '벽면 집중', description: '큰 가구를 벽과 모서리에 모아 빈 바닥을 확보합니다.' }
];

export function optimizeLayouts(input) {
  const room = normalizeRoom(input);
  const furniture = [...new Set(input.furniture || [])]
    .filter((id) => FURNITURE_CATALOG[id])
    .map((id) => ({ id, ...FURNITURE_CATALOG[id] }));

  if (!furniture.length) throw new Error('배치할 가구를 하나 이상 선택하세요.');

  const doorZone = createDoorZone(room.width, room.depth, room.doorWall);
  const usedSignatures = new Set();
  const layouts = STRATEGIES.map((strategy) => {
    let attempt = 0;
    let layout = createLayout(room, furniture, doorZone, strategy, attempt);
    while (usedSignatures.has(layoutSignature(layout)) && attempt < 128) {
      attempt += 1;
      layout = createLayout(room, furniture, doorZone, strategy, attempt);
    }
    let omitCount = 1;
    while (usedSignatures.has(layoutSignature(layout)) && omitCount < furniture.length) {
      attempt = 0;
      layout = createLayout(room, furniture, doorZone, strategy, attempt, omitCount);
      while (usedSignatures.has(layoutSignature(layout)) && attempt < 32) {
        attempt += 1;
        layout = createLayout(room, furniture, doorZone, strategy, attempt, omitCount);
      }
      omitCount += 1;
    }
    for (const excluded of furniture) {
      if (!usedSignatures.has(layoutSignature(layout))) break;
      attempt = 0;
      layout = createLayout(room, furniture, doorZone, strategy, attempt, 0, excluded.id);
      while (usedSignatures.has(layoutSignature(layout)) && attempt < 32) {
        attempt += 1;
        layout = createLayout(room, furniture, doorZone, strategy, attempt, 0, excluded.id);
      }
    }
    usedSignatures.add(layoutSignature(layout));
    return layout;
  }).sort((a, b) => b.score - a.score || STRATEGIES.findIndex((strategy) => strategy.id === a.id) - STRATEGIES.findIndex((strategy) => strategy.id === b.id));
  return layouts.map((layout, index) => ({ ...layout, rank: index + 1 }));
}

export function recommendedFurniture(roomType) {
  return [...(ROOM_FURNITURE[roomType] || ROOM_FURNITURE.studio)];
}

export function createDoorZone(width, depth, wall) {
  const opening = Math.min(0.9, wall === 'top' || wall === 'bottom' ? width * 0.35 : depth * 0.35);
  const clearance = Math.min(0.9, wall === 'top' || wall === 'bottom' ? depth * 0.3 : width * 0.3);
  if (wall === 'top') return { x: (width - opening) / 2, y: 0, w: opening, d: clearance, wall };
  if (wall === 'left') return { x: 0, y: (depth - opening) / 2, w: clearance, d: opening, wall };
  if (wall === 'right') return { x: width - clearance, y: (depth - opening) / 2, w: clearance, d: opening, wall };
  return { x: (width - opening) / 2, y: depth - clearance, w: opening, d: clearance, wall: 'bottom' };
}

export function rectanglesOverlap(a, b, gap = 0) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.d + gap <= b.y ||
    b.y + b.d + gap <= a.y
  );
}

function normalizeRoom(input) {
  const width = Number(input.width);
  const depth = Number(input.depth);
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width < 2 || depth < 2 || width > 8 || depth > 8) {
    throw new Error('방 가로와 세로는 2m 이상 8m 이하로 입력하세요.');
  }
  return {
    width: round(width),
    depth: round(depth),
    doorWall: ['top', 'right', 'bottom', 'left'].includes(input.doorWall) ? input.doorWall : 'bottom',
    windowWall: ['top', 'right', 'bottom', 'left'].includes(input.windowWall) ? input.windowWall : 'top',
    priority: input.priority || 'storage'
  };
}

function createLayout(room, furniture, doorZone, strategy, variationAttempt = 0, omitCount = 0, excludedId = null) {
  const placed = [];
  const orderedAll = [...furniture].sort((a, b) => {
    if (strategy.id === 'balanced') return relationOrder(a.id) - relationOrder(b.id);
    return b.width * b.depth - a.width * a.depth;
  });
  const available = excludedId ? orderedAll.filter((item) => item.id !== excludedId) : orderedAll;
  const omitted = [
    ...(excludedId ? orderedAll.filter((item) => item.id === excludedId) : []),
    ...(omitCount ? available.slice(-omitCount) : [])
  ];
  const ordered = omitCount ? available.slice(0, -omitCount) : available;
  const unplaced = omitted.map((item) => item.id);

  for (const item of ordered) {
    const candidates = generateCandidates(item, room)
      .filter((candidate) => !rectanglesOverlap(candidate, doorZone, 0.08))
      .filter((candidate) => placed.every((other) => !rectanglesOverlap(candidate, other, 0.12)))
      .map((candidate) => ({ candidate, score: scoreCandidate(candidate, item, placed, room, doorZone, strategy, variationAttempt) }))
      .sort((a, b) => b.score - a.score || a.candidate.y - b.candidate.y || a.candidate.x - b.candidate.x);

    if (candidates.length) {
      const candidateIndex = variationAttempt > 0 && placed.length === 0
        ? (variationAttempt - 1) % candidates.length
        : 0;
      placed.push({ ...candidates[candidateIndex].candidate, id: item.id, name: item.name, color: item.color });
    }
    else unplaced.push(item.id);
  }

  const occupiedArea = placed.reduce((total, item) => total + item.w * item.d, 0);
  const roomArea = room.width * room.depth;
  const occupiedRatio = occupiedArea / roomArea;
  const wallRatio = placed.length ? placed.filter((item) => touchesWall(item, room)).length / placed.length : 0;
  const doorCenterX = doorZone.x + doorZone.w / 2;
  const doorCenterY = doorZone.y + doorZone.d / 2;
  const diagonal = Math.hypot(room.width, room.depth);
  const doorDistanceRatio = placed.length
    ? placed.reduce((total, item) => total + distance(item.x + item.w / 2, item.y + item.d / 2, doorCenterX, doorCenterY), 0) / placed.length / diagonal
    : 0;
  const centerObstruction = placed.filter((item) => {
    const centerX = item.x + item.w / 2;
    const centerY = item.y + item.d / 2;
    return centerX > room.width * 0.3 && centerX < room.width * 0.7 && centerY > room.depth * 0.3 && centerY < room.depth * 0.7;
  }).length;
  const circulation = clamp(Math.round(76 + doorDistanceRatio * 34 - occupiedRatio * 36 - centerObstruction * 5 - unplaced.length * 24), 35, 99);
  const utilization = clamp(Math.round(60 + wallRatio * 23 + Math.min(occupiedRatio, 0.35) * 28 - unplaced.length * 18), 30, 98);
  const score = Math.round(circulation * 0.56 + utilization * 0.44);

  return {
    id: strategy.id,
    name: strategy.name,
    description: strategy.description,
    room,
    doorZone,
    items: placed,
    unplaced,
    score,
    circulation,
    utilization
  };
}

function generateCandidates(item, room) {
  const orientations = [{ w: item.width, d: item.depth, rotated: false }];
  if (item.width !== item.depth) orientations.push({ w: item.depth, d: item.width, rotated: true });
  const candidates = [];
  const seen = new Set();

  for (const orientation of orientations) {
    const maxX = room.width - orientation.w;
    const maxY = room.depth - orientation.d;
    if (maxX < 0 || maxY < 0) continue;

    for (let x = 0; x <= maxX + 0.001; x += 0.25) {
      addCandidate(candidates, seen, x, 0, orientation);
      addCandidate(candidates, seen, x, maxY, orientation);
    }
    for (let y = 0; y <= maxY + 0.001; y += 0.25) {
      addCandidate(candidates, seen, 0, y, orientation);
      addCandidate(candidates, seen, maxX, y, orientation);
    }

    if (['table', 'chair', 'plant'].includes(item.id)) {
      for (let x = 0; x <= maxX + 0.001; x += 0.5) {
        for (let y = 0; y <= maxY + 0.001; y += 0.5) addCandidate(candidates, seen, x, y, orientation);
      }
    }
  }
  return candidates;
}

function addCandidate(candidates, seen, x, y, orientation) {
  const candidate = { x: round(x), y: round(y), w: orientation.w, d: orientation.d, rotated: orientation.rotated };
  const key = `${candidate.x}:${candidate.y}:${candidate.w}:${candidate.d}`;
  if (!seen.has(key)) {
    seen.add(key);
    candidates.push(candidate);
  }
}

function scoreCandidate(candidate, item, placed, room, doorZone, strategy, variationAttempt) {
  const centerX = candidate.x + candidate.w / 2;
  const centerY = candidate.y + candidate.d / 2;
  const roomCenterX = room.width / 2;
  const roomCenterY = room.depth / 2;
  const doorCenterX = doorZone.x + doorZone.w / 2;
  const doorCenterY = doorZone.y + doorZone.d / 2;
  const distanceFromDoor = distance(centerX, centerY, doorCenterX, doorCenterY);
  const distanceFromCenter = distance(centerX, centerY, roomCenterX, roomCenterY);
  const wallContact = wallContactCount(candidate, room);
  const windowContact = touchesNamedWall(candidate, room, room.windowWall);
  let score = wallContact * 12 + distanceFromDoor * 1.4;

  if (strategy.id === 'flow') score += distanceFromCenter * 8 + distanceFromDoor * 7;
  if (strategy.id === 'compact') score += wallContact * 20 + candidate.x * 13 - candidate.y * 4;
  if (strategy.id === 'balanced') score += (windowContact ? 26 : 0) - distanceFromCenter * 4 + candidate.y * 2;

  if (item.id === 'desk') score += windowContact ? 25 : 0;
  if (item.id === 'storage') score += wallContact * 13 - (windowContact ? 15 : 0);
  if (item.id === 'bed' || item.id === 'sofa') score += distanceFromDoor * 2;
  if (item.id === 'plant') score += windowContact ? 12 : 0;

  const related = relatedItem(item.id, placed);
  if (related) {
    const relatedDistance = distance(centerX, centerY, related.x + related.w / 2, related.y + related.d / 2);
    const ideal = item.id === 'chair' ? 0.9 : 1.6;
    score += Math.max(0, 18 - Math.abs(relatedDistance - ideal) * 8);
  }

  if (room.priority === 'light' && windowContact) score += 10;
  if (room.priority === 'storage' && item.id === 'storage') score += wallContact * 8;
  if (room.priority === 'rest' && ['bed', 'sofa'].includes(item.id)) score += distanceFromDoor * 3;
  if (room.priority === 'work' && item.id === 'desk') score += windowContact ? 16 : 0;
  if (variationAttempt > 0) {
    const target = variationTarget(strategy.id, variationAttempt, room, item.id);
    score -= distance(centerX, centerY, target.x, target.y) * 60;
  }
  return score;
}

function variationTarget(strategyId, attempt, room, itemId) {
  const anchors = [
    { x: room.width * 0.15, y: room.depth * 0.15 },
    { x: room.width * 0.85, y: room.depth * 0.15 },
    { x: room.width * 0.15, y: room.depth * 0.85 },
    { x: room.width * 0.85, y: room.depth * 0.85 },
    { x: room.width * 0.5, y: room.depth * 0.1 },
    { x: room.width * 0.5, y: room.depth * 0.9 },
    { x: room.width * 0.1, y: room.depth * 0.5 },
    { x: room.width * 0.9, y: room.depth * 0.5 }
  ];
  const strategyOffset = STRATEGIES.findIndex((strategy) => strategy.id === strategyId) * 2;
  const itemOffset = Object.keys(FURNITURE_CATALOG).indexOf(itemId) * 3;
  return anchors[(attempt - 1 + strategyOffset + itemOffset) % anchors.length];
}

function layoutSignature(layout) {
  return layout.items.map((item) => `${item.id}:${item.x}:${item.y}:${item.w}:${item.d}`).join('|');
}

function relatedItem(id, placed) {
  if (id === 'chair') return placed.find((item) => item.id === 'desk');
  if (id === 'table') return placed.find((item) => item.id === 'sofa');
  return null;
}

function relationOrder(id) {
  return ['desk', 'sofa', 'bed', 'chair', 'table', 'storage', 'plant'].indexOf(id);
}

function touchesWall(item, room) {
  return wallContactCount(item, room) > 0;
}

function wallContactCount(item, room) {
  const epsilon = 0.02;
  return [
    item.x <= epsilon,
    item.y <= epsilon,
    item.x + item.w >= room.width - epsilon,
    item.y + item.d >= room.depth - epsilon
  ].filter(Boolean).length;
}

function touchesNamedWall(item, room, wall) {
  const epsilon = 0.02;
  if (wall === 'top') return item.y <= epsilon;
  if (wall === 'bottom') return item.y + item.d >= room.depth - epsilon;
  if (wall === 'left') return item.x <= epsilon;
  return item.x + item.w >= room.width - epsilon;
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
