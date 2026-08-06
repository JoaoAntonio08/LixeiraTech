import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { PhoneExplodeScene } from "../three/PhoneExplodeScene";
import { canRun3D, isLowPowerDevice } from "../../lib/deviceCapability";
import { LineIcon } from "../ui/LineIcon";
import "./PhoneExplodeStory.css";

gsap.registerPlugin(ScrollTrigger);

// Cada capítulo "pertence" a uma janela de progresso do scroll (0→1).
// A lista de capítulos (lado esquerdo) fica sempre visível — só o texto
// de detalhe (lado direito) troca de conteúdo. Assim nunca existe um
// instante em que a tela fica sem nenhum texto.
const BEATS = [
  {
    from: 0,
    to: 0.16,
    chapter: "Isso é o que sobra",
    detail: "Um objeto qualquer. Jogado fora sem pensar duas vezes.",
  },
  {
    from: 0.16,
    to: 0.34,
    chapter: "O que a gente não vê",
    detail: "A gente não vê esse volume crescer dentro da lixeira. Mas ele nunca para.",
  },
  {
    from: 0.34,
    to: 0.5,
    chapter: "Por dentro",
    detail: "Um celular comum. Por dentro, uma dezena de materiais diferentes.",
  },
  {
    from: 0.5,
    to: 0.64,
    chapter: "Placa-mãe e bateria",
    detail: "Chumbo, mercúrio, cádmio, lítio — descartados juntos, contaminam solo e água.",
  },
  {
    from: 0.64,
    to: 0.82,
    chapter: "Câmera e alto-falante",
    detail: "Terras raras e vidro que levam décadas para se decompor.",
  },
  {
    from: 0.82,
    to: 1.01,
    chapter: "E agora?",
    detail: "Cada uma dessas peças, descartada certo, vira dado. Vira prova.",
  },
];

export function PhoneExplodeStory() {
  const scrollRef = useRef(null);
  const progressRef = useRef(0);
  const [enabled3D] = useState(() => canRun3D() && !isLowPowerDevice());
  const [beatIndex, setBeatIndex] = useState(0);

  useEffect(() => {
    if (!enabled3D || !scrollRef.current) return undefined;

    const trigger = ScrollTrigger.create({
      trigger: scrollRef.current,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.6,
      onUpdate: (self) => {
        progressRef.current = self.progress;
        const idx = BEATS.findIndex((b) => self.progress >= b.from && self.progress < b.to);
        if (idx !== -1) setBeatIndex((prev) => (prev === idx ? prev : idx));
      },
    });

    return () => trigger.kill();
  }, [enabled3D]);

  if (!enabled3D) {
    return (
      <section className="phone-story-fallback container" aria-label="A jornada de um celular descartado">
        <p className="eyebrow">Isso é o que sobra</p>
        <h1 className="display phone-story-fallback-title">
          Um celular comum carrega uma dezena de materiais diferentes —
          <span className="text-accent"> e a maioria nunca é descartada certo.</span>
        </h1>
        <div className="phone-story-fallback-icons">
          <LineIcon name="cell" size={96} />
          <LineIcon name="chip" size={72} />
          <LineIcon name="leaf" size={72} />
        </div>
      </section>
    );
  }

  const beat = BEATS[beatIndex];

  return (
    <section className="phone-story" ref={scrollRef} aria-label="A jornada de um celular descartado">
      <div className="phone-story-sticky">
        {/* ---------- foco central: a lixeira / o celular ---------- */}
        <div className="phone-story-canvas-wrap">
          <Canvas camera={{ position: [0, 1.4, 6.5], fov: 42 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
            <PhoneExplodeScene progressRef={progressRef} />
          </Canvas>
        </div>

        {/* ---------- lado esquerdo: índice de capítulos, sempre visível ---------- */}
        <nav className="phone-story-chapters" aria-hidden="true">
          {BEATS.map((b, i) => (
            <div key={b.chapter} className={`phone-story-chapter ${i === beatIndex ? "is-active" : ""}`}>
              <span className="mono phone-story-chapter-index">{String(i + 1).padStart(2, "0")}</span>
              <span className="phone-story-chapter-label">{b.chapter}</span>
            </div>
          ))}
        </nav>

        {/* ---------- lado direito: detalhe do capítulo atual (crossfade, nunca some) ---------- */}
        <div className="phone-story-detail">
          <p className="eyebrow phone-story-detail-eyebrow">
            Capítulo {String(beatIndex + 1).padStart(2, "0")}/{BEATS.length}
          </p>
          <motion.h2
            key={beatIndex}
            className="display phone-story-detail-text"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {beat.detail}
          </motion.h2>
        </div>

        {beatIndex === 0 && (
          <motion.p
            className="phone-story-hint mono text-faint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            role para continuar
          </motion.p>
        )}
      </div>
    </section>
  );
}
