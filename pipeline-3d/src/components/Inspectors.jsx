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
const TROUSER_COLOR = '#5F7389'
const BOOT_COLOR = '#3F4E60'
const VEST_COLOR = '#BCD97F'
const REFLECTIVE_COLOR = '#E9EEF3'
const BOARD_COLOR = '#C8B48F'
const PAPER_COLOR = '#F4F6F8'
const LINE_COLOR = '#AEB8C4'
const CHECK_COLOR = '#5FAF78'

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
      <mesh>
        <sphereGeometry args={[0.09, 14, 12]} />
        <meshStandardMaterial color={shirtColor} roughness={0.55} />
      </mesh>
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

function Leg({ legRef, x }) {
  return (
    <group ref={legRef} position={[x, 0.62, 0]}>
      <RoundedBox args={[0.18, 0.62, 0.2]} radius={0.05} smoothness={2} position={[0, -0.31, 0]} castShadow>
        <meshStandardMaterial color={TROUSER_COLOR} roughness={0.7} />
      </RoundedBox>
      <RoundedBox args={[0.2, 0.1, 0.26]} radius={0.03} smoothness={2} position={[0, -0.57, 0.03]} castShadow>
        <meshStandardMaterial color={BOOT_COLOR} roughness={0.5} />
      </RoundedBox>
    </group>
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
      <Leg legRef={leftLegRef} x={-0.13} />
      <Leg legRef={rightLegRef} x={0.13} />
      <RoundedBox args={[0.5, 0.42, 0.3]} radius={0.08} smoothness={3} position={[0, 0.83, 0]} castShadow>
        <meshStandardMaterial color={PURPLE} roughness={0.55} />
      </RoundedBox>
      <RoundedBox args={[0.54, 0.38, 0.33]} radius={0.07} smoothness={3} position={[0, 0.83, 0]} castShadow>
        <meshStandardMaterial color={VEST_COLOR} roughness={0.6} />
      </RoundedBox>
      {[0.96, 0.74].map((y) => (
        <group key={y} position={[0, y, 0]}>
          <mesh position={[0, 0, 0.168]}>
            <boxGeometry args={[0.46, 0.04, 0.012]} />
            <meshStandardMaterial color={REFLECTIVE_COLOR} metalness={0.3} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, -0.168]}>
            <boxGeometry args={[0.46, 0.04, 0.012]} />
            <meshStandardMaterial color={REFLECTIVE_COLOR} metalness={0.3} roughness={0.3} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 0.16, 12]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.3, 0]} castShadow>
        <sphereGeometry args={[0.2, 20, 16]} />
        <meshStandardMaterial color={SKIN_COLOR} roughness={0.6} />
      </mesh>
      {/* HardHat is built at y 1.17; this lifts it onto the head at y 1.3. */}
      <group position={[0, 0.15, 0]}>
        <HardHat />
      </group>
      <group ref={leftArmRef} position={[-0.33, 1, 0]}>
        <LimbSet shirtColor={PURPLE} />
      </group>
      <group ref={rightArmRef} position={[0.33, 1, 0]}>
        <LimbSet shirtColor={PURPLE} />
        <group position={[0, -0.5, 0.1]}>
          <mesh castShadow>
            <boxGeometry args={[0.26, 0.34, 0.03]} />
            <meshStandardMaterial color={BOARD_COLOR} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0.018]}>
            <boxGeometry args={[0.2, 0.26, 0.01]} />
            <meshStandardMaterial color={PAPER_COLOR} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.16, 0.03]}>
            <boxGeometry args={[0.1, 0.04, 0.03]} />
            <meshStandardMaterial color={LINE_COLOR} metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[-0.01, 0.06, 0.025]}>
            <boxGeometry args={[0.14, 0.014, 0.01]} />
            <meshStandardMaterial color={LINE_COLOR} />
          </mesh>
          <mesh position={[-0.02, -0.04, 0.025]} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.05, 0.025, 0.01]} />
            <meshStandardMaterial color={CHECK_COLOR} emissive={CHECK_COLOR} emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0.035, -0.023, 0.025]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.1, 0.025, 0.01]} />
            <meshStandardMaterial color={CHECK_COLOR} emissive={CHECK_COLOR} emissiveIntensity={0.3} />
          </mesh>
        </group>
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
