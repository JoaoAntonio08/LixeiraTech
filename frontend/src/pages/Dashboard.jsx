import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { api } from "../lib/api";
import { calculateAggregateImpact, AVG_CO2_PER_POINT_SAFE } from "../lib/impact";
import { ImpactStat, PointsBadge } from "../components/ui/ImpactStat";
import { Card } from "../components/ui/Card";
import { Timeline } from "../components/ui/Timeline";
import { Button } from "../components/ui/Button";
import "./Dashboard.css";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      api.user.stats(user.id),
      api.deposits.listByUser(user.id),
      api.user.ranking(user.id),
    ])
      .then(([statsData, depositsData, rankingData]) => {
        if (cancelled) return;
        setStats(statsData);
        setDeposits(depositsData || []);
        setRanking(rankingData);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [user]);

  const approved = deposits.filter((d) => d.status === "approved");
  const impact = calculateAggregateImpact(approved);
  const classImpactEstimate = (stats?.classPoints || 0) * AVG_CO2_PER_POINT_SAFE;

  return (
    <div className="dashboard container">
      <section className="dashboard-hero">
        <p className="eyebrow">Seu impacto</p>
        <h1 className="display dashboard-title">
          {loading ? "Calculando seu impacto…" : `Olá, ${user?.name?.split(" ")[0] || "aluno"}.`}
        </h1>

        <div className="dashboard-stats">
          <ImpactStat label="kg de e-lixo desviado" value={impact.ewasteKg} suffix=" kg" />
          <ImpactStat label="kg de CO2 evitado" value={impact.co2Kg} suffix=" kg" accent="cyan" />
          <ImpactStat label="árvores equivalentes" value={impact.treesEquivalent} decimals={2} />
        </div>

        <div className="dashboard-hero-footer">
          <PointsBadge points={stats?.totalPoints ?? user?.points ?? 0} />
          <Button as={Link} to="/depositar">Registrar novo depósito</Button>
        </div>
      </section>

      <section className="dashboard-grid">
        <Card className="dashboard-class-card">
          <p className="eyebrow">Impacto coletivo da turma</p>
          <h3 className="display">{user?.class_name}</h3>
          <div className="dashboard-class-stats">
            <div>
              <span className="mono fs-mono-lg text-accent">{classImpactEstimate.toFixed(1)} kg</span>
              <p className="text-dim">CO2 evitado pela turma (estimativa)</p>
            </div>
            <div>
              <span className="mono fs-mono-lg">#{stats?.classPosition ?? "—"}</span>
              <p className="text-dim">sua posição na turma</p>
            </div>
          </div>
        </Card>

        <Card className="dashboard-ranking-card">
          <p className="eyebrow">Ranking (secundário)</p>
          <div className="dashboard-ranking-row">
            <span className="text-dim">Posição global</span>
            <span className="mono">#{ranking?.global ?? "—"}</span>
          </div>
          <div className="dashboard-ranking-row">
            <span className="text-dim">Posição na turma</span>
            <span className="mono">#{ranking?.class ?? "—"}</span>
          </div>
          <Link to="/ranking" className="text-accent mono dashboard-ranking-link">
            ver impacto da comunidade →
          </Link>
        </Card>
      </section>

      <section className="dashboard-timeline">
        <p className="eyebrow">Histórico de depósitos</p>
        <Timeline deposits={deposits} />
      </section>
    </div>
  );
}
