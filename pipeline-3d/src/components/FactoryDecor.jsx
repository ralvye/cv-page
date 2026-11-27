import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox, Text } from '@react-three/drei'
import { MathUtils } from 'three'
import HardHat from './HardHat.jsx'
import { PURPLE, YELLOW } from '../data/palette.js'

const MACHINE_POSITION = [1.8, 0, 0.9]
const MACHINE_CONVEYOR_POSITION = [1.8, 0, 2.3]
const ARM_POSITION = [4.6, 0, -6]
const SECOND_ARM_POSITION = [4.4, 0, 2.2]
const WORKER_POSITION = [-6.6, 0, 1.6]
const SCALABILITY_POSITION = [5.8, 0, -0.6]
const MACHINE_BAR_COLORS = ['#5B9BD5', YELLOW, '#5FAF78', PURPLE]
const CRATE_COLORS = [YELLOW, '#5FAF78', '#5B9BD5']

function CicdEngine({ position }) {
  const barRefs = useRef([])

  useFrame((state) => {
    const time = state.clock.elapsedTime
    barRefs.current.forEach((bar, i) => {
      bar.scale.y = 0.55 + 0.45 * Math.sin(time * 2.4 + i * 1.3)
    })
  })

  return (
    <group position={position}>
      <RoundedBox args={[2.4, 2.2, 2]} radius={0.16} smoothness={4} position={[0, 1.1, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#BACBDB" roughness={0.25} metalness={0.2} clearcoat={0.5} clearcoatRoughness={0.2} />
      </RoundedBox>
      <RoundedBox args={[2.1, 0.3, 1.7]} radius={0.08} smoothness={3} position={[0, 2.35, 0]} castShadow>
        <meshStandardMaterial color="#94A8BD" roughness={0.4} metalness={0.3} />
      </RoundedBox>
      <Text
        position={[0, 2.52, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.18}
        letterSpacing={0.05}
        color="#14202E"
        anchorX="center"
        anchorY="middle"
      >
        CI/CD ENGINE
      </Text>
      <mesh position={[0, 1, 1.01]}>
        <boxGeometry args={[1.8, 1.2, 0.04]} />
        <meshStandardMaterial color="#44566B" roughness={0.3} />
      </mesh>
      {MACHINE_BAR_COLORS.map((color, i) => (
        <mesh
          key={color}
          ref={(element) => {
            barRefs.current[i] = element
          }}
          position={[-0.6 + i * 0.4, 0.9, 1.05]}
        >
          <boxGeometry args={[0.2, 1, 0.05]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
        </mesh>
      ))}
    </group>
  )
}

function DecorConveyor({ position }) {
  const crateRefs = useRef([])

  useFrame((state) => {
    const time = state.clock.elapsedTime
    crateRefs.current.forEach((crate, i) => {
      const progress = (time * 0.3 + i / CRATE_COLORS.length) % 1
      crate.position.x = MathUtils.lerp(-1.2, 1.2, progress)
    })
  })

  return (
    <group position={position}>
      <RoundedBox args={[3.2, 0.25, 0.8]} radius={0.05} smoothness={2} position={[0, 0.13, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#B3C6D6" roughness={0.6} metalness={0.2} />
      </RoundedBox>
      {CRATE_COLORS.map((color, i) => (
        <mesh
          key={color}
          ref={(element) => {
            crateRefs.current[i] = element
          }}
          position={[0, 0.48, 0]}
          castShadow
        >
          <boxGeometry args={[0.45, 0.45, 0.45]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function RobotArm({ position, phase = 0 }) {
  const armRef = useRef(null)

  useFrame((state) => {
    armRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.8 + phase) * 0.45
  })

  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.6, 0.6, 24]} />
        <meshStandardMaterial color="#7D8BA0" metalness={0.5} roughness={0.4} />
      </mesh>
      <group ref={armRef} position={[0, 0.6, 0]}>
        <mesh position={[0, 1.2, 0]} castShadow>
          <boxGeometry args={[0.32, 2.4, 0.32]} />
          <meshStandardMaterial color="#A9B8C8" metalness={0.4} roughness={0.35} />
        </mesh>
        <mesh position={[0.7, 2.4, 0]} castShadow>
          <boxGeometry args={[1.4, 0.28, 0.28]} />
          <meshStandardMaterial color="#A9B8C8" metalness={0.4} roughness={0.35} />
        </mesh>
        <mesh position={[1.4, 1.95, 0]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color={YELLOW} roughness={0.5} />
        </mesh>
      </group>
    </group>
  )
}

function Worker({ position }) {
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.24, 0.5, 6, 14]} />
        <meshStandardMaterial color="#5B86BC" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.22, 20, 16]} />
        <meshStandardMaterial color="#F2C9A0" roughness={0.6} />
      </mesh>
      <HardHat />
      <RoundedBox args={[1.4, 1.4, 1.4]} radius={0.12} smoothness={3} position={[0, 0.7, 1]} castShadow receiveShadow>
        <meshStandardMaterial color="#7A8799" metalness={0.3} roughness={0.5} />
      </RoundedBox>
      <Text
        position={[0, 0.7, 1.73]}
        fontSize={0.16}
        letterSpacing={0.03}
        color="#FFFFFF"
        anchorX="center"
        anchorY="middle"
      >
        MONOLITH
      </Text>
    </group>
  )
}

function Trophy({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]} castShadow>
        <boxGeometry args={[0.4, 0.06, 0.4]} />
        <meshStandardMaterial color="#44566B" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.1, 12]} />
        <meshStandardMaterial color={YELLOW} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.1, 0.32, 24]} />
        <meshStandardMaterial color={YELLOW} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  )
}

function ScalabilityBlock({ position }) {
  return (
    <group position={position}>
      <RoundedBox args={[2, 1.4, 2]} radius={0.14} smoothness={4} position={[0, 0.7, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#5B86BC" roughness={0.25} metalness={0.15} clearcoat={0.5} clearcoatRoughness={0.2} />
      </RoundedBox>
      <Text
        position={[0, 0.72, 1.01]}
        fontSize={0.2}
        letterSpacing={0.04}
        color="#FFFFFF"
        anchorX="center"
        anchorY="middle"
      >
        SCALABILITY
      </Text>
      <Trophy position={[0, 1.4, 0]} />
    </group>
  )
}

function Padlock({ position, phase = 0 }) {
  const groupRef = useRef(null)

  useFrame((state) => {
    groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.6 + phase) * 0.08
  })

  return (
    <group ref={groupRef} position={position}>
      <RoundedBox args={[0.3, 0.26, 0.14]} radius={0.03} smoothness={2} castShadow>
        <meshStandardMaterial color={YELLOW} metalness={0.4} roughness={0.35} />
      </RoundedBox>
      <mesh position={[0, 0.13, 0]} castShadow>
        <torusGeometry args={[0.1, 0.03, 10, 24, Math.PI]} />
        <meshStandardMaterial color="#7D8BA0" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  )
}

function FloorLabel({ position, children }) {
  return (
    <Text
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.2}
      letterSpacing={0.03}
      maxWidth={4}
      textAlign="center"
      color="#14202E"
      anchorX="center"
      anchorY="middle"
    >
      {children}
    </Text>
  )
}

export default function FactoryDecor() {
  return (
    <group>
      <CicdEngine position={MACHINE_POSITION} />
      <DecorConveyor position={MACHINE_CONVEYOR_POSITION} />
      <RobotArm position={ARM_POSITION} />
      <RobotArm position={SECOND_ARM_POSITION} phase={2.1} />
      <Worker position={WORKER_POSITION} />
      <ScalabilityBlock position={SCALABILITY_POSITION} />
      <Padlock position={[4.4, 2.5, -1.2]} />
      <Padlock position={[7.4, 1.8, 1.4]} phase={1.7} />
      <FloorLabel position={[-5.6, 0.05, -1.4]}>MICROSERVICES ARCHITECTURES</FloorLabel>
      <FloorLabel position={[2.4, 0.05, 4.3]}>DEPLOYED FEATURES</FloorLabel>
    </group>
  )
}
