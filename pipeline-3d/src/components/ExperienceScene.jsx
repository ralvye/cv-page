import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei'
import PipelineStations from './PipelineStations.jsx'

const AZIMUTH_CENTER = Math.PI / 4

function SceneReady({ onReady }) {
  useEffect(() => {
    onReady()
  }, [onReady])
  return null
}

function Floor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#101010" roughness={0.9} metalness={0.1} />
      </mesh>
      <Grid
        args={[40, 40]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#2F4F2F"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#36454F"
        fadeDistance={32}
        fadeStrength={1.5}
      />
    </>
  )
}

export default function ExperienceScene({ onReady, activeId, onHover, onSelect }) {
  return (
    <Canvas
      orthographic
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: [12, 12, 12], zoom: 42, near: 0.1, far: 200 }}
    >
      <color attach="background" args={['#101010']} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#dfe9df', '#101010', 0.4]} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={0.9}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-6, 4, -6]} color="#39FF14" intensity={18} distance={20} />
      <pointLight position={[6, 4, 6]} color="#00F0FF" intensity={10} distance={18} />

      <Suspense fallback={null}>
        <Floor />
        <PipelineStations activeId={activeId} onHover={onHover} onSelect={onSelect} />
        <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={30} blur={2.5} far={6} />
      </Suspense>

      <SceneReady onReady={onReady} />
      <OrbitControls
        target={[0, 1, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minZoom={34}
        maxZoom={80}
        minPolarAngle={0.6}
        maxPolarAngle={1.2}
        minAzimuthAngle={AZIMUTH_CENTER - 0.6}
        maxAzimuthAngle={AZIMUTH_CENTER + 0.6}
      />
    </Canvas>
  )
}
