import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { calculateImpact } from "../lib/impact";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import "./Admin.css";

const TABS = [
  { key: "pending", label: "Aprovações" },
  { key: "students", label: "Alunos" },
  { key: "classes", label: "Ranking por turma" },
];

export default function Admin() {
  const [tab, setTab] = useState("pending");
  const [globalStats, setGlobalStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [students, setStudents] = useState([]);
  const [classRankings, setClassRankings] = useState([]);
  const [pointsDraft, setPointsDraft] = useState({});
  const [addPointsDraft, setAddPointsDraft] = useState({});
  const [busyId, setBusyId] = useState(null);

  function loadAll() {
    api.admin.globalStats().then(setGlobalStats).catch(() => {});
    api.admin.pendingDeposits().then(setPending).catch(() => {});
    api.admin.students().then(setStudents).catch(() => {});
    api.admin.classRankings().then(setClassRankings).catch(() => {});
  }

  useEffect(loadAll, []);

  async function approve(deposit) {
    const points = Number(pointsDraft[deposit.id] ?? Math.round((deposit.weight || 0) * 10));
    setBusyId(deposit.id);
    try {
      await api.admin.approveDeposit(deposit.id, points);
      setPending((prev) => prev.filter((d) => d.id !== deposit.id));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(deposit) {
    setBusyId(deposit.id);
    try {
      await api.admin.rejectDeposit(deposit.id);
      setPending((prev) => prev.filter((d) => d.id !== deposit.id));
    } finally {
      setBusyId(null);
    }
  }

  async function addManualPoints(studentId) {
    const points = Number(addPointsDraft[studentId] || 0);
    if (!points) return;
    await api.admin.addPoints(studentId, points, "Pontos manuais (admin)");
    setAddPointsDraft((prev) => ({ ...prev, [studentId]: "" }));
    api.admin.students().then(setStudents).catch(() => {});
  }

  return (
    <div className="admin container">
      <p className="eyebrow">Painel administrativo</p>
      <h1 className="display admin-title">Gestão da Lixeira Tech</h1>

      <div className="admin-stats-grid">
        <Card><span className="mono fs-mono-lg text-accent">{globalStats?.totalStudents ?? "—"}</span><p className="text-dim">alunos cadastrados</p></Card>
        <Card><span className="mono fs-mono-lg text-accent">{globalStats?.totalClasses ?? "—"}</span><p className="text-dim">turmas ativas</p></Card>
        <Card><span className="mono fs-mono-lg text-accent">{globalStats?.totalDeposits ?? "—"}</span><p className="text-dim">depósitos aprovados</p></Card>
        <Card><span className="mono fs-mono-lg text-accent">{globalStats?.todayDeposits ?? "—"}</span><p className="text-dim">depósitos hoje</p></Card>
      </div>

      <div className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`admin-tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} {t.key === "pending" && pending.length > 0 && `(${pending.length})`}
          </button>
        ))}
      </div>

      {tab === "pending" && (
        <div className="admin-panel">
          {pending.length === 0 && <p className="text-dim">Nenhum depósito pendente. 🎉</p>}
          <AnimatePresence>
            {pending.map((d) => {
              const impact = calculateImpact(d.weight, d.wasteType);
              return (
                <motion.div
                  key={d.id}
                  className="admin-row"
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="admin-row-info">
                    <strong>{d.userName}</strong>
                    <span className="text-dim mono"> · {d.class_name} · {d.wasteType} · {d.weight} kg</span>
                    <div className="text-accent mono admin-row-impact">
                      ~{impact.co2Kg} kg CO2 se aprovado
                    </div>
                  </div>
                  <div className="admin-row-actions">
                    <Input
                      type="number"
                      className="admin-points-input"
                      placeholder={String(Math.round((d.weight || 0) * 10))}
                      value={pointsDraft[d.id] ?? ""}
                      onChange={(e) => setPointsDraft((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    />
                    <Button variant="ghost" disabled={busyId === d.id} onClick={() => approve(d)}>Aprovar</Button>
                    <Button variant="danger" disabled={busyId === d.id} onClick={() => reject(d)}>Rejeitar</Button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {tab === "students" && (
        <div className="admin-panel">
          <table className="admin-table">
            <thead>
              <tr><th>Nome</th><th>Turma</th><th>Pontos</th><th>Adicionar pontos</th></tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="text-dim">{s.class_name}</td>
                  <td className="mono text-accent">{s.points}</td>
                  <td>
                    <div className="admin-add-points">
                      <Input
                        type="number"
                        className="admin-points-input"
                        value={addPointsDraft[s.id] || ""}
                        onChange={(e) => setAddPointsDraft((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder="+ pts"
                      />
                      <Button variant="ghost" onClick={() => addManualPoints(s.id)}>Adicionar</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "classes" && (
        <div className="admin-panel admin-classes-grid">
          {classRankings.map((c) => (
            <Card key={c.class_name}>
              <h3 className="display">{c.class_name}</h3>
              <ol className="admin-class-ranking">
                {c.ranking.map((r) => (
                  <li key={r.rank} className="admin-class-ranking-row">
                    <span className="mono text-faint">#{r.rank}</span>
                    <span>{r.name}</span>
                    <span className="mono text-accent">{r.points} pts</span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
