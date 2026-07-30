import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../store/AuthContext";
import { api } from "../lib/api";
import { AVG_CO2_PER_POINT_SAFE } from "../lib/impact";
import { Podium } from "../components/ui/Podium";
import "./Ranking.css";

export default function Ranking() {
  const { user } = useAuth();
  const [scope, setScope] = useState("global");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const request =
      scope === "global" ? api.leaderboard.global() : api.leaderboard.byClass(user.class_name);

    request
      .then((data) => setRows(data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [scope, user]);

  const entries = rows.map((r) => ({
    name: r.name,
    class: r.class || user?.class_name,
    points: r.points,
    co2Kg: Number(r.points || 0) * AVG_CO2_PER_POINT_SAFE,
  }));

  return (
    <div className="ranking container">
      <p className="eyebrow">Impacto da comunidade</p>
      <h1 className="display ranking-title">Quem está transformando descarte em resultado.</h1>

      <div className="ranking-toggle">
        <button
          className={`ranking-toggle-btn ${scope === "global" ? "active" : ""}`}
          onClick={() => setScope("global")}
        >
          Geral
        </button>
        <button
          className={`ranking-toggle-btn ${scope === "class" ? "active" : ""}`}
          onClick={() => setScope("class")}
        >
          Minha turma
        </button>
      </div>

      {!loading && entries.length > 0 && (
        <motion.div layout className="ranking-podium-wrap">
          <Podium entries={entries.slice(0, 3)} />
        </motion.div>
      )}

      <motion.ol layout className="ranking-list">
        {entries.slice(3).map((entry, i) => (
          <motion.li
            layout
            key={`${entry.name}-${i}`}
            className="ranking-row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
          >
            <span className="mono text-faint">#{i + 4}</span>
            <span className="ranking-row-name">{entry.name}</span>
            <span className="text-dim mono">{entry.class}</span>
            <span className="mono text-accent">~{entry.co2Kg.toFixed(1)} kg CO2</span>
            <span className="text-faint mono ranking-row-points">{entry.points} pts</span>
          </motion.li>
        ))}
      </motion.ol>

      {!loading && entries.length === 0 && (
        <p className="text-dim ranking-empty">Ainda não há depósitos aprovados nesse recorte.</p>
      )}
    </div>
  );
}
