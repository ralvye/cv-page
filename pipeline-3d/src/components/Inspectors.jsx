import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { MathUtils } from 'three'
import HardHat from './HardHat.jsx'
import { stations } from '../data/stations.js'
import { PURPLE } from '../data/palette.js'

const SQRT2 = Math.SQRT2
const LOOP_U = 11.5
const LOOP_V = 6.8
const WALK_SPEED = 2.6
const DWELL_SECONDS = 2.2
const TURN_RATE = 6
const MAX_FRAME_SECONDS = 0.1
const RAISED_ARM_ANGLE = -1.3
const SKIN_COLOR = '#F2C9A0'
const TROUSER_COLOR = '#2B3A4A'
const CHECK_COLOR = '#1FD65F'

// (u, v) are platform-local axes: world x = (u + v) / √2 and world z = (v - u) / √2.
const CORNERS = [
  [-LOOP_U, -LOOP_V],
  [LOOP_U, -LOOP_V],
  [LOOP_U, LOOP_V],
  [-LOOP_U, LOOP_V],
]

function buildEdges() {
  let start = 0
  return CORNERS.map((from, i) => {
    const to = CORNERS[(i + 1) % CORNERS.length]
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const edge = { from, dir: [(to[0] - from[0]) / length, (to[1] - from[1]) / length], start, length }
    start += length
    return edge
  })
}

const EDGES = buildEdges()
const BACK_EDGE = EDGES[0]
const LEFT_EDGE = EDGES[3]
const PERIMETER = EDGES.reduce((total, edge) => total + edge.length, 0)

function toUV([x, , z]) {
  return [(x - z) / SQRT2, (x + z) / SQRT2]
}

function toWorld(u, v) {
  return [(u + v) / SQRT2, 0, (v - u) / SQRT2]
}

function yawFor(du, dv) {
  return Math.atan2(du + dv, dv - du)
}

function lerpAngle(from, to, t) {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + difference * t
}

function locate(arc) {
  const s = ((arc % PERIMETER) + PERIMETER) % PERIMETER
  const edge = EDGES.find((candidate) => s < candidate.start + candidate.length)
  const t = s - edge.start
  return { u: edge.from[0] + edge.dir[0] * t, v: edge.from[1] + edge.dir[1] * t, dir: edge.dir }
}

function arcOnEdge(edge, [u, v]) {
  return edge.start + (u - edge.from[0]) * edge.dir[0] + (v - edge.from[1]) * edge.dir[1]
}

function passedStop(previous, next, stopArc) {
  return Math.floor((next - stopArc) / PERIMETER) > Math.floor((previous - stopArc) / PERIMETER)
}

function inspectionStop(edge, point, [stationU, stationV]) {
  return {
    arc: arcOnEdge(edge, point),
    yaw: yawFor(stationU - point[0], stationV - point[1]),
  }
}

const STATION_UV = Object.fromEntries(stations.map((station) => [station.id, toUV(station.position)]))

const INSPECTION_STOPS = [
  inspectionStop(LEFT_EDGE, [-LOOP_U, STATION_UV.build[1]], STATION_UV.build),
  inspectionStop(BACK_EDGE, [STATION_UV.test[0], -LOOP_V], STATION_UV.test),
  inspectionStop(BACK_EDGE, [STATION_UV.deploy[0], -LOOP_V], STATION_UV.deploy),
  inspectionStop(BACK_EDGE, [STATION_UV.production[0], -LOOP_V], STATION_UV.production),
]

const INSPECTOR_START_ARCS = [0, PERIMETER / 3, (PERIMETER * 2) / 3]

function createWalker(startArc) {
  const { dir } = locate(startArc)
  return {
    arc: startArc,
    yaw: yawFor(dir[0], dir[1]),
    pausedUntil: -Infinity,
    stop: null,
    walk: 0,
    raise: 0,
    phase: 0,
  }
}

function advance(walker, delta, now) {
  const previous = walker.arc
  walker.arc += WALK_SPEED * delta
  const stop = INSPECTION_STOPS.find((candidate) => passedStop(previous, walker.arc, candidate.arc))
  if (stop) {
    walker.arc = stop.arc
    walker.stop = stop
    walker.pausedUntil = now + DWELL_SECONDS
  }
}

function LimbSet({ shirtColor }) {
  return (
    <>
      <RoundedBox args={[0.16, 0.52, 0.16]} radius={0.06} smoothness={2} position={[0, -0.26, 0]} castShadow>
        <meshStandardMaterial color={shirtColor} roughness={0.55} />
      </RoundedBox>
      <mesh position={[0, -0.55, 0]}>
        <sphereGeometry args={[0.09, 14, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
      </mesh>
    </>
  )
}

function Inspector({ startArc }) {
  const walkerRef = useRef(createWalker(startArc))
  const rootRef = useRef(null)
  const leftLegRef = useRef(null)
  const rightLegRef = useRef(null)
  const leftArmRef = useRef(null)
  const rightArmRef = useRef(null)

  useFrame((state, frameSeconds) => {
    const delta = Math.min(frameSeconds, MAX_FRAME_SECONDS)
    const walker = walkerRef.current
    const now = state.clock.elapsedTime
    if (now >= walker.pausedUntil) advance(walker, delta, now)

    const paused = now < walker.pausedUntil
    const { u, v, dir } = locate(walker.arc)
    const targetYaw = paused ? walker.stop.yaw : yawFor(dir[0], dir[1])
    walker.yaw = lerpAngle(walker.yaw, targetYaw, Math.min(1, delta * TURN_RATE))
    walker.walk = MathUtils.lerp(walker.walk, paused ? 0 : 1, Math.min(1, delta * 5))
    walker.raise = MathUtils.lerp(walker.raise, paused ? 1 : 0, Math.min(1, delta * 5))
    walker.phase += delta * 8 * walker.walk

    const swing = Math.sin(walker.phase) * 0.5 * walker.walk
    rootRef.current.position.set(...toWorld(u, v))
    rootRef.current.position.y = Math.abs(Math.sin(walker.phase)) * 0.04 * walker.walk
    rootRef.current.rotation.y = walker.yaw
    leftLegRef.current.rotation.x = swing
    rightLegRef.current.rotation.x = -swing
    leftArmRef.current.rotation.x = -swing * (1 - walker.raise)
    rightArmRef.current.rotation.x = MathUtils.lerp(swing, RAISED_ARM_ANGLE, walker.raise)
  })

  return (
    <group ref={rootRef}>
      <group ref={leftLegRef} position={[-0.13, 0.62, 0]}>
        <RoundedBox args={[0.18, 0.62, 0.2]} radius={0.05} smoothness={2} position={[0, -0.31, 0]} castShadow>
          <meshStandardMaterial color={TROUSER_COLOR} roughness={0.7} />
        </RoundedBox>
      </group>
      <group ref={rightLegRef} position={[0.13, 0.62, 0]}>
        <RoundedBox args={[0.18, 0.62, 0.2]} radius={0.05} smoothness={2} position={[0, -0.31, 0]} castShadow>
          <meshStandardMaterial color={TROUSER_COLOR} roughness={0.7} />
        </RoundedBox>
      </group>
      <RoundedBox args={[0.5, 0.56, 0.3]} radius={0.08} smoothness={3} position={[0, 0.9, 0]} castShadow>
        <meshStandardMaterial color={PURPLE} roughness={0.55} />
      </RoundedBox>
      <mesh position={[0, 0.8, 0.16]}>
        <boxGeometry args={[0.52, 0.06, 0.02]} />
        <meshStandardMaterial color="#F0F0F0" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.2, 20, 16]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
      </mesh>
      <HardHat />
      <group ref={leftArmRef} position={[-0.33, 1.08, 0]}>
        <LimbSet shirtColor={PURPLE} />
      </group>
      <group ref={rightArmRef} position={[0.33, 1.08, 0]}>
        <LimbSet shirtColor={PURPLE} />
        <mesh position={[0, -0.5, 0.1]} castShadow>
          <boxGeometry args={[0.26, 0.34, 0.03]} />
          <meshStandardMaterial color="#F0F0F0" roughness={0.5} />
        </mesh>
        <mesh position={[0.05, -0.46, 0.12]}>
          <boxGeometry args={[0.1, 0.03, 0.02]} />
          <meshStandardMaterial color={CHECK_COLOR} emissive={CHECK_COLOR} emissiveIntensity={0.6} />
        </mesh>
      </group>
    </group>
  )
}

export default function Inspectors() {
  return (
    <group>
      {INSPECTOR_START_ARCS.map((startArc) => (
        <Inspector key={startArc} startArc={startArc} />
      ))}
    </group>
  )
}
