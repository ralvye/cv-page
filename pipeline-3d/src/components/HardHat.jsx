import { YELLOW } from '../data/palette.js'

export default function HardHat() {
  return (
    <group position={[0, 1.17, 0]}>
      <mesh castShadow>
        <sphereGeometry args={[0.25, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={YELLOW} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.01, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.03, 28]} />
        <meshStandardMaterial color={YELLOW} roughness={0.35} />
      </mesh>
    </group>
  )
}
