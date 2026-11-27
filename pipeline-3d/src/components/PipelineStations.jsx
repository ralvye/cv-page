import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, Text } from '@react-three/drei'
import { MathUtils, MeshStandardMaterial, Vector3 } from 'three'
import { stations } from '../data/stations.js'
import { PURPLE, YELLOW } from '../data/palette.js'

const STATION_POINTS = stations.map((station) => new Vector3(...station.position))
const SEGMENTS = STATION_POINTS.length - 1
const ITEM_COLORS = ['#5B9BD5', YELLOW, '#5FAF78', PURPLE, '#8E9AAF', '#E58DB0']
const ITEM_SPEED = 0.05
const STATION_CLEARANCE = 1.4
const FLASH_DURATION = 1.4
const GLOW_MATERIALS = stations.map(
  () =>
    new MeshStandardMaterial({
      color: '#FFFFFF',
      emissive: '#1FD65F',
      emissiveIntensity: 0.25,
      roughness: 0.4,
    }),
)

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
        <meshStandardMaterial color="#B3C6D6" roughness={0.6} metalness={0.2} />
      </mesh>
      {[-0.42, 0.42].map((z) => (
        <mesh key={z} position={[0, 0.07, z]}>
          <boxGeometry args={[length, 0.06, 0.05]} />
          <meshStandardMaterial color="#6F7E8F" roughness={0.3} metalness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function BuildIcon() {
  return (
    <group position={[0, 1.1, 1.12]}>
      <mesh>
        <torusGeometry args={[0.42, 0.06, 12, 40]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.4} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.4} />
      </mesh>
    </group>
  )
}

function TestIcon() {
  return (
    <group position={[0, 1.1, 1.12]}>
      <mesh>
        <torusGeometry args={[0.42, 0.06, 12, 40]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.4} />
      </mesh>
      <mesh position={[-0.13, -0.02, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.1, 0.26, 0.05]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.4} />
      </mesh>
      <mesh position={[0.08, 0.06, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.1, 0.44, 0.05]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.4} />
      </mesh>
    </group>
  )
}

function DeployIcon({ glow }) {
  return (
    <group position={[0, 1.1, 1.12]}>
      {[-0.32, 0, 0.32].map((y) => (
        <group key={y} position={[0, y, 0]}>
          <mesh>
            <boxGeometry args={[0.95, 0.22, 0.04]} />
            <meshStandardMaterial color="#44566B" roughness={0.5} />
          </mesh>
          <mesh position={[0.34, 0, 0.03]} material={glow}>
            <sphereGeometry args={[0.045, 12, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function ProductionIcon() {
  return (
    <group position={[0, 1.1, 1.12]}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.26, 0.1, 0.3, 24]} />
        <meshStandardMaterial color="#44566B" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.12, 12]} />
        <meshStandardMaterial color="#44566B" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.22, 0]}>
        <boxGeometry args={[0.32, 0.08, 0.22]} />
        <meshStandardMaterial color="#44566B" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  )
}

const VISUALS = {
  build: BuildIcon,
  test: TestIcon,
  deploy: DeployIcon,
  production: ProductionIcon,
}

function Station({ station, index, arrivals, isActive, onHover, onSelect }) {
  const groupRef = useRef(null)
  const glow = GLOW_MATERIALS[index]
  const Visual = VISUALS[station.id]

  useFrame((state) => {
    const now = state.clock.elapsedTime
    const sinceArrival = now - arrivals.current[index]
    const flash = Math.max(0, 1 - sinceArrival / FLASH_DURATION)
    const blink = 0.5 + 0.5 * Math.sin(now * 30)
    GLOW_MATERIALS[index].emissiveIntensity = (isActive ? 0.6 : 0.25) + flash * blink * 2.2

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
      <RoundedBox args={[3, 0.3, 3]} radius={0.12} smoothness={3} position={[0, 0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#BCD2E1" roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[2.2, 1.6, 2.2]} radius={0.14} smoothness={4} position={[0, 1.1, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={station.color}
          roughness={0.45}
          metalness={0.1}
          clearcoat={0.5}
          clearcoatRoughness={0.2}
        />
      </RoundedBox>
      <Visual glow={glow} />
      <Text
        position={[0, 1.93, 0.05]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={station.name.length > 6 ? 0.22 : 0.32}
        letterSpacing={0.04}
        color={station.labelColor ?? '#FFFFFF'}
        anchorX="center"
        anchorY="middle"
      >
        {station.name}
      </Text>
      <mesh position={[0.75, 1.97, -0.75]} material={glow}>
        <cylinderGeometry args={[0.16, 0.16, 0.08, 20]} />
      </mesh>
    </group>
  )
}

function ConveyorItems({ arrivals }) {
  const itemRefs = useRef([])
  const lastTime = useRef(0)
  const offsets = useMemo(() => ITEM_COLORS.map((_, i) => i / ITEM_COLORS.length), [])
  const materials = useMemo(
    () => ITEM_COLORS.map((color) => new MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 })),
    [],
  )
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials])

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
      mesh.position.set(position.x, 0.36, position.z)
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
          material={materials[i]}
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
