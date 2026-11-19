import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls, OrthographicCamera, RoundedBox } from '@react-three/drei'
import FactoryDecor from './FactoryDecor.jsx'
import PipelineStations from './PipelineStations.jsx'

const AZIMUTH_CENTER = Math.PI / 4
const PLATFORM_ROTATION = Math.PI / 4
const CAMERA_POSITION = [12, 12, 12]
const DESIGN_WIDTH = 20
const DESIGN_HEIGHT = 11

function SceneReady({ onReady }) {
  useEffect(() => {
    onReady()
  }, [onReady])
  return null
}

function FitCamera() {
  const size = useThree((state) => state.size)
  const zoom = Math.max(12, Math.min(size.width / DESIGN_WIDTH, size.height / DESIGN_HEIGHT))

  return <OrthographicCamera makeDefault position={CAMERA_POSITION} near={0.1} far={200} zoom={zoom} />
}

function Platform() {
  return (
    <group rotation={[0, PLATFORM_ROTATION, 0]}>
      <RoundedBox args={[30, 0.5, 18]} radius={0.2} smoothness={4} position={[0, -0.25, 0]} receiveShadow>
        <meshStandardMaterial color="#8FCBEE" roughness={0.8} />
      </RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[30, 18]} />
        <meshStandardMaterial color="#F2FAFE" roughness={0.9} />
      </mesh>
      <Grid
        args={[30, 18]}
        cellSize={1.5}
        cellThickness={0.5}
        cellColor="#C9E6F7"
        sectionSize={6}
        sectionThickness={0.8}
        sectionColor="#AFD8F1"
        fadeDistance={40}
        fadeStrength={1}
        position={[0, 0.02, 0]}
      />
    </group>
  )
}

export default function ExperienceScene({ onReady, activeId, onHover, onSelect }) {
  return (
    <Canvas
      orthographic
      flat
      shadows="percentage"
      dpr={[1, 2]}
    >
      <color attach="background" args={['#BFE6FA']} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#FFFFFF', '#8FCBEE', 0.9]} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={50}
      />

      <Suspense fallback={null}>
        <Platform />
        <PipelineStations activeId={activeId} onHover={onHover} onSelect={onSelect} />
        <FactoryDecor />
        <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={30} blur={2.5} far={6} color="#2B5C86" />
      </Suspense>

      <FitCamera />
      <SceneReady onReady={onReady} />
      <OrbitControls
        target={[-1, 0.8, -0.3]}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.6}
        maxPolarAngle={1.2}
        minAzimuthAngle={AZIMUTH_CENTER - 0.6}
        maxAzimuthAngle={AZIMUTH_CENTER + 0.6}
      />
    </Canvas>
  )
}
