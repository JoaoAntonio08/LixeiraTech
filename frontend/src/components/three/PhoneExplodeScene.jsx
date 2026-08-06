import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const ACCENT = "#d4ff3d";
const ACCENT_DIM = "#7a9424";

/**
 * ============================================================
 * PHONE EXPLODE SCENE
 * ============================================================
 * Narrativa em 6 atos, controlada por `progressRef.current` (0→1),
 * atualizado fora do React (via ScrollTrigger no componente pai) para
 * não gerar re-render a cada frame — mesmo padrão já usado no resto
 * do projeto.
 *
 *  0.00–0.10  Plano aberto: a lixeira, vista de fora.
 *  0.10–0.25  Câmera aproxima e "entra" na lixeira.
 *  0.25–0.40  O celular é revelado, centralizado.
 *  0.40–0.55  Explode: tela e carcaça se afastam.
 *  0.55–0.70  Bateria e placa-mãe se destacam.
 *  0.70–0.85  Câmera e alto-falante se destacam.
 *  0.85–1.00  Leve rotação de "descanso" no estado explodido.
 *
 * Tudo em wireframe (EdgesGeometry) para manter a linguagem line-art
 * do resto do site — nada de modelo fotorrealista importado.
 */
export function PhoneExplodeScene({ progressRef }) {
  const { camera } = useThree();
  const binGroup = useRef();
  const phoneGroup = useRef();

  const screenRef = useRef();
  const caseRef = useRef();
  const batteryRef = useRef();
  const pcbRef = useRef();
  const camModuleRef = useRef();
  const speakerRef = useRef();

  // ---------- geometrias (memoizadas, criadas uma única vez) ----------
  const binGeom = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.9, 0.65, 1.5, 20, 1, true);
    return new THREE.EdgesGeometry(g);
  }, []);
  const binRimGeom = useMemo(() => new THREE.EdgesGeometry(new THREE.TorusGeometry(0.9, 0.03, 8, 24)), []);

  const caseGeom = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.62, 1.3, 0.09, 2, 2, 1)), []);
  const screenGeom = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.56, 1.22, 0.015)), []);
  const batteryGeom = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.32, 0.55, 0.05)), []);
  const pcbGeom = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.42, 0.28, 0.02)), []);
  const chipGeoms = useMemo(
    () => [
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.07, 0.07, 0.03)),
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.05, 0.05, 0.02)),
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.09, 0.04, 0.02)),
    ],
    []
  );
  const camModuleGeom = useMemo(() => new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16)), []);
  const speakerGeom = useMemo(() => new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20)), []);

  const dustGeom = useMemo(() => {
    const count = 90;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2.2;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.4;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geom;
  }, []);

  useFrame((state) => {
    const t = progressRef.current ?? 0;
    const clock = state.clock.getElapsedTime();

    // ---------- fases nomeadas (facilita ler as curvas abaixo) ----------
    // Ajuste chave: bin e celular têm uma janela de sobreposição bem maior
    // (bin só termina de sumir bem depois do celular já estar 100% visível),
    // então nunca existe um instante em que os dois estão quase invisíveis
    // ao mesmo tempo — antes isso deixava a tela "preta" por um instante.
    const zoomIn = smoothstep(0.0, 0.22, t); // câmera afasta -> entra na lixeira
    const phoneIn = smoothstep(0.14, 0.3, t); // celular aparece (começa mais cedo)
    const binFade = Math.max(0.14, 1 - smoothstep(0.28, 0.52, t)); // lixeira nunca some 100%, vira "moldura" de fundo
    const explode = smoothstep(0.4, 0.7, t); // separação geral das peças
    const detailFocus = smoothstep(0.55, 0.85, t); // destaque bateria/placa/câmera

    // ---------- câmera ----------
    // Começa afastada e "de cima", termina de frente e próxima —
    // dolly real da câmera (não do grupo), então a perspectiva muda de verdade.
    const camZ = THREE.MathUtils.lerp(6.5, 3.2, zoomIn);
    const camY = THREE.MathUtils.lerp(1.4, 0, zoomIn);
    camera.position.set(0, camY, camZ);
    camera.lookAt(0, 0, 0);
    camera.rotation.z = Math.sin(clock * 0.15) * 0.008;

    // ---------- lixeira ----------
    if (binGroup.current) {
      binGroup.current.visible = binFade > 0.01;
      binGroup.current.traverse((obj) => {
        if (obj.material) obj.material.opacity = binFade;
      });
      binGroup.current.position.y = THREE.MathUtils.lerp(0, -0.4, zoomIn);
      binGroup.current.rotation.y = clock * 0.05;
    }

    // ---------- celular (grupo todo) ----------
    if (phoneGroup.current) {
      phoneGroup.current.visible = phoneIn > 0.01;
      const rest = 1 - explode * 0.15;
      phoneGroup.current.scale.setScalar(THREE.MathUtils.lerp(0.5, 1, phoneIn) * rest + explode * 0.15);
      phoneGroup.current.rotation.y = (1 - explode) * 0.15 + explode * clock * 0.12 + t * 0.6;
    }

    // ---------- explosão das peças ----------
    applyExplode(screenRef, [0, 0, 0.55], explode, phoneIn);
    applyExplode(caseRef, [0, 0, -0.4], explode, phoneIn);
    applyExplode(batteryRef, [-0.55, -0.05, 0.05], explode, phoneIn, detailFocus, 1.15);
    applyExplode(pcbRef, [0.55, 0.15, 0.02], explode, phoneIn, detailFocus, 1.15);
    applyExplode(camModuleRef, [0.05, 0.75, 0.4], explode, phoneIn, detailFocus, 1.3);
    applyExplode(speakerRef, [-0.05, -0.85, 0.3], explode, phoneIn, detailFocus, 1.3);
  });

  return (
    <group>
      {/* ---------- lixeira ---------- */}
      <group ref={binGroup} position={[0, 0, 0]}>
        <lineSegments geometry={binGeom}>
          <lineBasicMaterial color={ACCENT_DIM} transparent opacity={1} />
        </lineSegments>
        <lineSegments geometry={binRimGeom} position={[0, 0.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <lineBasicMaterial color={ACCENT_DIM} transparent opacity={1} />
        </lineSegments>
      </group>

      {/* ---------- celular (peças independentes p/ explodir) ---------- */}
      <group ref={phoneGroup} position={[0, 0, 0]}>
        <lineSegments ref={screenRef} geometry={screenGeom}>
          <lineBasicMaterial color={ACCENT} transparent opacity={0} />
        </lineSegments>

        <lineSegments ref={caseRef} geometry={caseGeom}>
          <lineBasicMaterial color={ACCENT} transparent opacity={0} />
        </lineSegments>

        <group ref={batteryRef}>
          <lineSegments geometry={batteryGeom}>
            <lineBasicMaterial color={ACCENT} transparent opacity={0} />
          </lineSegments>
        </group>

        <group ref={pcbRef}>
          <lineSegments geometry={pcbGeom}>
            <lineBasicMaterial color={ACCENT} transparent opacity={0} />
          </lineSegments>
          {chipGeoms.map((g, i) => (
            <lineSegments key={i} geometry={g} position={[-0.12 + i * 0.13, 0.04 - i * 0.02, 0.02]}>
              <lineBasicMaterial color={ACCENT} transparent opacity={0} />
            </lineSegments>
          ))}
        </group>

        <group ref={camModuleRef}>
          <lineSegments geometry={camModuleGeom} rotation={[Math.PI / 2, 0, 0]}>
            <lineBasicMaterial color={ACCENT} transparent opacity={0} />
          </lineSegments>
        </group>

        <group ref={speakerRef}>
          <lineSegments geometry={speakerGeom} rotation={[Math.PI / 2, 0, 0]}>
            <lineBasicMaterial color={ACCENT} transparent opacity={0} />
          </lineSegments>
        </group>
      </group>

      <points geometry={dustGeom}>
        <pointsMaterial color={ACCENT} size={0.015} transparent opacity={0.25} />
      </points>
    </group>
  );
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Desloca uma peça do celular do centro até `offset * explode`, com fade-in
 * de opacidade em `phoneIn` e um pequeno "bounce" extra quando `detailFocus`
 * (bateria/placa/câmera se destacam um pouco mais que tela/carcaça).
 */
function applyExplode(ref, offset, explode, phoneIn, detailFocus = 0, extra = 1) {
  if (!ref.current) return;
  const [ox, oy, oz] = offset;
  const push = explode * extra + detailFocus * 0.12;
  ref.current.position.set(ox * push, oy * push, oz * push);

  const opacity = phoneIn;
  if (ref.current.material) {
    ref.current.material.opacity = opacity;
  } else {
    ref.current.traverse?.((obj) => {
      if (obj.material) obj.material.opacity = opacity;
    });
  }
}
