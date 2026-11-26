import * as THREE from 'three'

export type CollisionBox = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

type CollisionIndex = {
  boxes: CollisionBox[]
  cellSize: number
  cells: Map<string, number[]>
}

const cellKey = (x: number, z: number) => `${x},${z}`
const PLAYER_HEIGHT = 1.78

function hasNoCollision(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current.userData?.mpdNoCollision === true) return true
    current = current.parent
  }
  return false
}

/** Build a lightweight world-space collider list from solid visible meshes. */
export function collectStudioCollisionBoxes(scene: THREE.Scene): CollisionBox[] {
  scene.updateMatrixWorld(true)
  const boxes: CollisionBox[] = []
  const worldBox = new THREE.Box3()
  const size = new THREE.Vector3()

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || !mesh.visible) return
    if (hasNoCollision(mesh)) return

    const explicitSolid = mesh.userData?.mpdSolid === true
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (!explicitSolid && materials.length > 0 && materials.every((material) => {
      const candidate = material as THREE.Material & { opacity?: number; colorWrite?: boolean }
      return candidate.transparent === true || candidate.opacity === 0 || candidate.colorWrite === false
    })) return

    worldBox.setFromObject(mesh)
    if (worldBox.isEmpty()) return
    worldBox.getSize(size)
    if (![worldBox.min.x, worldBox.max.x, worldBox.min.y, worldBox.max.y, worldBox.min.z, worldBox.max.z].every(Number.isFinite)) return

    const horizontalMax = Math.max(size.x, size.z)
    // Skip the room floor, island/sea sheets, panorama domes, roof slabs and other scenery-sized meshes.
    if (!explicitSolid && (size.y < 0.48 || horizontalMax > 21 || size.y > 14 || Math.max(size.x, size.z) < 0.48)) return
    if (explicitSolid && horizontalMax > 42) return

    let minX = worldBox.min.x
    let maxX = worldBox.max.x
    let minZ = worldBox.min.z
    let maxZ = worldBox.max.z
    // Vertical glass planes have almost no depth in their geometry bounds. Give them a real collision thickness.
    if (explicitSolid && maxX - minX < 0.13) {
      const middle = (minX + maxX) * 0.5
      minX = middle - 0.07
      maxX = middle + 0.07
    }
    if (explicitSolid && maxZ - minZ < 0.13) {
      const middle = (minZ + maxZ) * 0.5
      minZ = middle - 0.07
      maxZ = middle + 0.07
    }
    boxes.push({ minX, maxX, minY: worldBox.min.y, maxY: worldBox.max.y, minZ, maxZ })
  })

  return boxes
}

const indexCache = new WeakMap<CollisionBox[], CollisionIndex>()

function buildIndex(boxes: CollisionBox[], cellSize = 5): CollisionIndex {
  const cells = new Map<string, number[]>()
  boxes.forEach((box, index) => {
    const minCellX = Math.floor(box.minX / cellSize)
    const maxCellX = Math.floor(box.maxX / cellSize)
    const minCellZ = Math.floor(box.minZ / cellSize)
    const maxCellZ = Math.floor(box.maxZ / cellSize)
    for (let x = minCellX; x <= maxCellX; x += 1) {
      for (let z = minCellZ; z <= maxCellZ; z += 1) {
        const key = cellKey(x, z)
        const bucket = cells.get(key)
        if (bucket) bucket.push(index)
        else cells.set(key, [index])
      }
    }
  })
  return { boxes, cellSize, cells }
}

function getIndex(boxes: CollisionBox[]) {
  const cached = indexCache.get(boxes)
  if (cached) return cached
  const index = buildIndex(boxes)
  indexCache.set(boxes, index)
  return index
}

function nearbyBoxes(index: CollisionIndex, x: number, z: number, radius: number) {
  const found = new Set<number>()
  const minX = Math.floor((x - radius) / index.cellSize)
  const maxX = Math.floor((x + radius) / index.cellSize)
  const minZ = Math.floor((z - radius) / index.cellSize)
  const maxZ = Math.floor((z + radius) / index.cellSize)
  for (let cx = minX; cx <= maxX; cx += 1) {
    for (let cz = minZ; cz <= maxZ; cz += 1) {
      for (const id of index.cells.get(cellKey(cx, cz)) ?? []) found.add(id)
    }
  }
  return found
}

function isPositionFree(point: THREE.Vector3, index: CollisionIndex, radius: number, height = PLAYER_HEIGHT) {
  for (const id of nearbyBoxes(index, point.x, point.z, radius + 0.2)) {
    const box = index.boxes[id]
    if (box.maxY < point.y + 0.08 || box.minY > point.y + height) continue
    const nearestX = THREE.MathUtils.clamp(point.x, box.minX, box.maxX)
    const nearestZ = THREE.MathUtils.clamp(point.z, box.minZ, box.maxZ)
    const dx = point.x - nearestX
    const dz = point.z - nearestZ
    if (dx * dx + dz * dz < radius * radius) return false
  }
  return true
}

function lineIsFree(start: THREE.Vector3, end: THREE.Vector3, index: CollisionIndex, radius: number) {
  const distance = start.distanceTo(end)
  const steps = Math.max(1, Math.ceil(distance / 0.38))
  const sample = new THREE.Vector3()
  for (let i = 1; i <= steps; i += 1) {
    sample.lerpVectors(start, end, i / steps)
    if (!isPositionFree(sample, index, radius)) return false
  }
  return true
}

class MinHeap<T> {
  private items: { value: T; score: number }[] = []
  get size() { return this.items.length }
  push(value: T, score: number) {
    const item = { value, score }
    this.items.push(item)
    let index = this.items.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.items[parent].score <= score) break
      this.items[index] = this.items[parent]
      index = parent
    }
    this.items[index] = item
  }
  pop() {
    if (!this.items.length) return undefined
    const first = this.items[0]
    const last = this.items.pop()!
    if (this.items.length) {
      let index = 0
      while (true) {
        const left = index * 2 + 1
        const right = left + 1
        if (left >= this.items.length) break
        const child = right < this.items.length && this.items[right].score < this.items[left].score ? right : left
        if (this.items[child].score >= last.score) break
        this.items[index] = this.items[child]
        index = child
      }
      this.items[index] = last
    }
    return first.value
  }
}

/** A* navigation around furniture, consoles, glass walls, equipment and rock formations. */
export function findCollisionAwarePath(
  start: THREE.Vector3,
  requestedGoal: THREE.Vector3,
  boxes: CollisionBox[],
  options: { radius?: number; cellSize?: number; maxIterations?: number } = {},
): THREE.Vector3[] {
  const radius = options.radius ?? 0.36
  let cellSize = options.cellSize ?? 1.05
  const index = getIndex(boxes)
  const margin = 9
  let minX = Math.floor((Math.min(start.x, requestedGoal.x) - margin) / cellSize) * cellSize
  let maxX = Math.ceil((Math.max(start.x, requestedGoal.x) + margin) / cellSize) * cellSize
  let minZ = Math.floor((Math.min(start.z, requestedGoal.z) - margin) / cellSize) * cellSize
  let maxZ = Math.ceil((Math.max(start.z, requestedGoal.z) + margin) / cellSize) * cellSize
  const rawWidth = Math.ceil((maxX - minX) / cellSize) + 1
  const rawHeight = Math.ceil((maxZ - minZ) / cellSize) + 1
  if (rawWidth * rawHeight > 36000) {
    // Lower the search-grid density for long cross-island routes on mobile.
    cellSize = 1.45
    minX = Math.floor((Math.min(start.x, requestedGoal.x) - margin) / cellSize) * cellSize
    maxX = Math.ceil((Math.max(start.x, requestedGoal.x) + margin) / cellSize) * cellSize
    minZ = Math.floor((Math.min(start.z, requestedGoal.z) - margin) / cellSize) * cellSize
    maxZ = Math.ceil((Math.max(start.z, requestedGoal.z) + margin) / cellSize) * cellSize
  }
  const stepX = (maxX - minX) / Math.max(1, Math.round((maxX - minX) / cellSize))
  const stepZ = (maxZ - minZ) / Math.max(1, Math.round((maxZ - minZ) / cellSize))
  const width = Math.round((maxX - minX) / stepX) + 1
  const height = Math.round((maxZ - minZ) / stepZ) + 1
  const startCell = { x: THREE.MathUtils.clamp(Math.round((start.x - minX) / stepX), 0, width - 1), z: THREE.MathUtils.clamp(Math.round((start.z - minZ) / stepZ), 0, height - 1) }
  const goalCell = { x: THREE.MathUtils.clamp(Math.round((requestedGoal.x - minX) / stepX), 0, width - 1), z: THREE.MathUtils.clamp(Math.round((requestedGoal.z - minZ) / stepZ), 0, height - 1) }
  const key = (x: number, z: number) => `${x},${z}`
  const horizontalDX = requestedGoal.x - start.x
  const horizontalDZ = requestedGoal.z - start.z
  const horizontalLengthSq = horizontalDX * horizontalDX + horizontalDZ * horizontalDZ
  const depthAlongRoute = (x: number, z: number) => {
    if (horizontalLengthSq < 0.0001) return requestedGoal.y
    const progress = THREE.MathUtils.clamp(
      ((x - start.x) * horizontalDX + (z - start.z) * horizontalDZ) / horizontalLengthSq,
      0,
      1,
    )
    return THREE.MathUtils.lerp(start.y, requestedGoal.y, progress)
  }
  const pointAt = (x: number, z: number) => {
    const worldX = minX + x * stepX
    const worldZ = minZ + z * stepZ
    return new THREE.Vector3(worldX, depthAlongRoute(worldX, worldZ), worldZ)
  }
  const free = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= width || z >= height) return false
    return isPositionFree(pointAt(x, z), index, radius)
  }
  const nearestFree = (origin: { x: number; z: number }, maximumRing: number) => {
    if (free(origin.x, origin.z)) return origin
    for (let ring = 1; ring <= maximumRing; ring += 1) {
      let best: { x: number; z: number } | null = null
      let bestDistance = Number.POSITIVE_INFINITY
      for (let dx = -ring; dx <= ring; dx += 1) {
        for (let dz = -ring; dz <= ring; dz += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue
          const x = origin.x + dx
          const z = origin.z + dz
          if (!free(x, z)) continue
          const distance = dx * dx + dz * dz
          if (distance < bestDistance) { best = { x, z }; bestDistance = distance }
        }
      }
      if (best) return best
    }
    return null
  }

  const startFree = nearestFree(startCell, 5)
  const goalFree = nearestFree(goalCell, 10)
  if (!startFree || !goalFree) return []
  if (start.distanceTo(requestedGoal) < 0.45 && isPositionFree(requestedGoal, index, radius)) return [requestedGoal.clone()]

  const open = new MinHeap<{ x: number; z: number }>()
  const cameFrom = new Map<string, string>()
  const cost = new Map<string, number>()
  const closed = new Set<string>()
  const startKey = key(startFree.x, startFree.z)
  const goalKey = key(goalFree.x, goalFree.z)
  const heuristic = (x: number, z: number) => Math.hypot(goalFree.x - x, goalFree.z - z)
  open.push(startFree, heuristic(startFree.x, startFree.z))
  cost.set(startKey, 0)
  const directions = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ] as const
  let iterations = 0
  const maxIterations = options.maxIterations ?? 24000
  while (open.size && iterations < maxIterations) {
    iterations += 1
    const current = open.pop()!
    const currentKey = key(current.x, current.z)
    if (closed.has(currentKey)) continue
    if (currentKey === goalKey) {
      const path: { x: number; z: number }[] = [current]
      let cursor = currentKey
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!
        const [x, z] = cursor.split(',').map(Number)
        path.push({ x, z })
      }
      path.reverse()
      const worldPath = path.map((cell) => pointAt(cell.x, cell.z))
      const smoothed: THREE.Vector3[] = []
      let anchor = 0
      while (anchor < worldPath.length - 1) {
        let next = worldPath.length - 1
        while (next > anchor + 1 && !lineIsFree(worldPath[anchor], worldPath[next], index, radius)) next -= 1
        smoothed.push(worldPath[next].clone())
        anchor = next
      }
      const last = smoothed[smoothed.length - 1]
      if (last && last.distanceTo(requestedGoal) < 1.2 && isPositionFree(requestedGoal, index, radius)) smoothed[smoothed.length - 1] = requestedGoal.clone()
      return smoothed
    }
    closed.add(currentKey)
    const currentCost = cost.get(currentKey) ?? Number.POSITIVE_INFINITY
    for (const [dx, dz, moveCost] of directions) {
      const nx = current.x + dx
      const nz = current.z + dz
      if (!free(nx, nz)) continue
      if (dx !== 0 && dz !== 0 && (!free(current.x + dx, current.z) || !free(current.x, current.z + dz))) continue
      const nextKey = key(nx, nz)
      if (closed.has(nextKey)) continue
      const nextCost = currentCost + moveCost
      if (nextCost >= (cost.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue
      cameFrom.set(nextKey, currentKey)
      cost.set(nextKey, nextCost)
      open.push({ x: nx, z: nz }, nextCost + heuristic(nx, nz))
    }
  }
  return []
}

/** Move in short swept steps; when a corner is hit, slide along its free axis. */
export function moveWithCollision(
  position: THREE.Vector3,
  delta: THREE.Vector3,
  boxes: CollisionBox[],
  options: { radius?: number; height?: number } = {},
) {
  const radius = options.radius ?? 0.36
  const index = getIndex(boxes)
  const distance = delta.length()
  const steps = Math.max(1, Math.ceil(distance / 0.24))
  const step = delta.clone().multiplyScalar(1 / steps)
  const before = position.clone()
  for (let i = 0; i < steps; i += 1) {
    const full = position.clone().add(step)
    if (isPositionFree(full, index, radius, options.height)) {
      position.copy(full)
      continue
    }
    let moved = false
    const tryAxis = (axis: 'x' | 'z') => {
      const axisDelta = axis === 'x'
        ? new THREE.Vector3(step.x, 0, 0)
        : new THREE.Vector3(0, 0, step.z)
      const candidate = position.clone().add(axisDelta)
      if (!isPositionFree(candidate, index, radius, options.height)) return false
      position.copy(candidate)
      return true
    }
    const primary: 'x' | 'z' = Math.abs(step.x) >= Math.abs(step.z) ? 'x' : 'z'
    const secondary: 'x' | 'z' = primary === 'x' ? 'z' : 'x'
    moved = tryAxis(primary) || moved
    moved = tryAxis(secondary) || moved
    if (!moved) break
  }
  return position.distanceToSquared(before) > 0.000001
}
