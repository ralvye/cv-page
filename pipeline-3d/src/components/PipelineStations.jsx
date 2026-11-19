import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import { MathUtils, MeshStandardMaterial, Vector3 } from 'three'
import { stations } from '../data/stations.js'

const STATION_POINTS = stations.map((station) => new Vector3(...station.position))
const SEGMENTS = STATION_POINTS.length - 1
const ITEM_COUNT = 6
const ITEM_SPEED = 0.05
const STATION_CLEARANCE = 1.2
const FLASH_DURATION = 1.4
const TOOL_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]

function pointAlongLine(progress) {
  const scaled = MathUtils.clamp(progress, 0, 1) * SEGMENTS
  const index = Math.min(Math.floor(scaled), SEGMENTS - 1)
  return new Vector3().lerpVectors(STATION_POINTS[index], STATION_POINTS[index + 1], scaled - index)
}

function Belt({ from, to }) {
  const direction = new Vector3().subVectors(to, from).normalize()
  const start = from.clone().addScaledVector(direction, STATION_CLEARANCE)
  const end = to.clone().addScaledVector(direction, -STATION_CLEARANCE)
  const length = start.distanceTo(end)
  const middle = new Vector3().addVectors(start, end).multiplyScalar(0.5)
  const angle = Math.atan2(direction.z, direction.x)

  return (
    <group position={[middle.x, 0.12, middle.z]} rotation={[0, -angle, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[length, 0.12, 0.9]} />
        <meshStandardMaterial color="#1A1A1A" roughness={0.6} metalness={0.5} />
      </mesh>
      {[-0.42, 0.42].map((z) => (
        <mesh key={z} position={[0, 0.07, z]}>
          <boxGeometry args={[length, 0.06, 0.05]} />
          <meshStandardMaterial color="#36454F" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function BuildNode({ glow }) {
  return (
    <>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.6, 1.2, 1.6]} />
        <meshStandardMaterial color="#36454F" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.22, 0]} material={glow}>
        <boxGeometry args={[1.2, 0.06, 1.2]} />
      </mesh>
      <mesh position={[0, 1.8, 0]} material={glow} castShadow>
        <sphereGeometry args={[0.26, 24, 24]} />
      </mesh>
    </>
  )
}

function TestGauge({ glow }) {
  const spinRef = useRef(null)
  useFrame((_, delta) => {
    spinRef.current.rotation.y += delta * 0.6
  })

  return (
    <>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.8, 1, 6]} />
        <meshStandardMaterial color="#36454F" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.85, 0.1, 16, 48]} />
        <meshStandardMaterial color="#36454F" metalness={0.8} roughness={0.25} />
      </mesh>
      <group ref={spinRef} position={[0, 1.5, 0]}>
        {TOOL_ANGLES.map((angle, i) => (
          <mesh key={angle} position={[Math.cos(angle) * 0.85, 0, Math.sin(angle) * 0.85]} material={glow}>
            {i % 2 ? <octahedronGeometry args={[0.2]} /> : <boxGeometry args={[0.28, 0.28, 0.28]} />}
          </mesh>
        ))}
      </group>
    </>
  )
}

function DeployRack({ glow }) {
  return (
    <>
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[1.3, 2.2, 1.3]} />
        <meshStandardMaterial color="#36454F" metalness={0.7} roughness={0.4} />
      </mesh>
      {[0, 1, 2, 3, 4].map((row) => (
        <group key={row} position={[0, 0.35 + row * 0.42, 0.66]}>
          <mesh>
            <boxGeometry args={[1.1, 0.3, 0.04]} />
            <meshStandardMaterial color="#1A1A1A" roughness={0.5} />
          </mesh>
          <mesh position={[0.42, 0, 0.03]} material={glow}>
            <sphereGeometry args={[0.04, 12, 12]} />
          </mesh>
        </group>
      ))}
    </>
  )
}

function ProductionPortal({ glow }) {
  return (
    <>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[1.4, 0.5, 1.4]} />
        <meshStandardMaterial color="#36454F" metalness={0.6} roughness={0.4} />
      </mesh>
      <group position={[0, 1.5, 0]} rotation={[0, Math.PI / 4, 0]}>
        <mesh castShadow>
          <torusGeometry args={[0.9, 0.1, 16, 48]} />
          <meshStandardMaterial color="#36454F" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh material={glow}>
          <circleGeometry args={[0.8, 48]} />
        </mesh>
      </group>
    </>
  )
}

const VISUALS = {
  build: BuildNode,
  test: TestGauge,
  deploy: DeployRack,
  production: ProductionPortal,
}

function Station({ station, index, arrivals, isActive, onHover, onSelect }) {
  const groupRef = useRef(null)
  const [glow] = useState(
    () =>
      new MeshStandardMaterial({
        color: '#2F4F2F',
        emissive: '#39FF14',
        emissiveIntensity: 0.25,
        roughness: 0.4,
        metalness: 0.2,
      }),
  )
  const Visual = VISUALS[station.id]

  useEffect(() => () => glow.dispose(), [glow])

  useFrame((state) => {
    const now = state.clock.elapsedTime
    const sinceArrival = now - arrivals.current[index]
    const flash = Math.max(0, 1 - sinceArrival / FLASH_DURATION)
    const blink = 0.5 + 0.5 * Math.sin(now * 30)
    glow.emissiveIntensity = (isActive ? 0.5 : 0.18) + flash * blink * 1.8

    const targetScale = isActive ? 1.06 : 1
    groupRef.current.scale.setScalar(MathUtils.lerp(groupRef.current.scale.x, targetScale, 0.15))
  })

  return (
    <group
      ref={groupRef}
      position={station.position}
      onPointerOver={(event) => {
        event.stopPropagation()
        onHover(station.id)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        onHover(null)
        document.body.style.cursor = 'auto'
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(station.id)
      }}
    >
      <mesh position={[0, 0.05, 0]} material={glow} receiveShadow>
        <cylinderGeometry args={[1.2, 1.3, 0.1, 40]} />
      </mesh>
      <Visual glow={glow} />
      <Billboard position={[0, 3.2, 0]}>
        <Text fontSize={0.34} letterSpacing={0.12} color={isActive ? '#39FF14' : '#F0F0F0'} anchorY="bottom">
          {station.name}
        </Text>
        <Text position={[0, -0.12, 0]} fontSize={0.18} color="#F0F0F0" fillOpacity={0.6} anchorY="top">
          {station.subtitle}
        </Text>
      </Billboard>
    </group>
  )
}

function ConveyorItems({ arrivals }) {
  const itemRefs = useRef([])
  const lastTime = useRef(0)
  const offsets = useMemo(() => Array.from({ length: ITEM_COUNT }, (_, i) => i / ITEM_COUNT), [])
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#B8C2CC',
        emissive: '#2F4F2F',
        emissiveIntensity: 0.4,
        metalness: 0.7,
        roughness: 0.3,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const now = state.clock.elapsedTime
    const previousTime = lastTime.current
    lastTime.current = now

    offsets.forEach((offset, i) => {
      const travelled = now * ITEM_SPEED + offset
      const previous = previousTime * ITEM_SPEED + offset

      STATION_POINTS.forEach((_, stationIndex) => {
        const stationProgress = stationIndex / SEGMENTS
        const crossing = Math.floor(previous - stationProgress) + 1
        if (crossing + stationProgress <= travelled) {
          arrivals.current[stationIndex] = now
        }
      })

      const position = pointAlongLine(travelled % 1)
      const mesh = itemRefs.current[i]
      mesh.visible = STATION_POINTS.every((point) => point.distanceTo(position) >= STATION_CLEARANCE)
      mesh.position.set(position.x, 0.42, position.z)
    })
  })

  return (
    <>
      {offsets.map((offset, i) => (
        <mesh
          key={offset}
          ref={(element) => {
            itemRefs.current[i] = element
          }}
          material={material}
          castShadow
        >
          {i % 2 ? <sphereGeometry args={[0.2, 20, 20]} /> : <boxGeometry args={[0.36, 0.36, 0.36]} />}
        </mesh>
      ))}
    </>
  )
}

export default function PipelineStations({ activeId, onHover, onSelect }) {
  const arrivals = useRef(stations.map(() => -Infinity))

  return (
    <group>
      {STATION_POINTS.slice(0, -1).map((from, i) => (
        <Belt key={stations[i].id} from={from} to={STATION_POINTS[i + 1]} />
      ))}
      {stations.map((station, index) => (
        <Station
          key={station.id}
          station={station}
          index={index}
          arrivals={arrivals}
          isActive={activeId === station.id}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
      <ConveyorItems arrivals={arrivals} />
    </group>
  )
}
