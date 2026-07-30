// server/index.js
//
// Backend da Lixeira Tech — versão para desenvolvimento/testes.
// Em vez de MySQL, os dados ficam em server/database/db.json
// (ver server/lib/jsonDb.js). Todos os endpoints e formatos de
// resposta são os mesmos que o frontend (src/lib/api.js) já espera —
// nenhum contrato mudou, só a forma como os dados são persistidos.

import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { readDB, writeDB } from './lib/jsonDb.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ---------- Helpers ----------

function generateAdminPassword(date = new Date()) {
  const dayLastDigit = date.getDate().toString().slice(-1);
  const monthLastDigit = (date.getMonth() + 1).toString().slice(-1);
  const yearLastDigit = date.getFullYear().toString().slice(-1);

  const digits = [dayLastDigit, monthLastDigit, yearLastDigit];
  let senha = '';

  for (const d of digits) {
    const n = parseInt(d);
    senha += d + (n * n);
  }

  return senha;
}

function isSameDay(isoA, isoB = new Date().toISOString()) {
  return String(isoA).slice(0, 10) === String(isoB).slice(0, 10);
}

function publicUser(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

// ---------- Auth ----------

app.post('/api/auth/signup', (req, res) => {
  try {
    const { name, matricula, email, password, class_name } = req.body;
    const db = readDB();

    const existing = db.users.find((u) => u.email === email || u.matricula === matricula);
    if (existing) {
      return res.status(400).json({ error: 'Usuário já existe' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const id = uuidv4();

    const user = {
      id,
      name,
      matricula,
      email,
      password_hash,
      class_name,
      points: 0,
      created_at: new Date().toISOString(),
    };

    db.users.push(user);
    writeDB(db);

    const { id: _id, name: _name, matricula: _mat, email: _email, class_name: _cls, points } = user;
    res.json({ user: { id: _id, name: _name, matricula: _mat, email: _email, class_name: _cls, points } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    // Login especial para admin
    if (email === 'admin') {
      const todayPassword = generateAdminPassword();
      if (password === todayPassword) {
        const adminUser = {
          id: 'admin',
          name: 'Administrador',
          matricula: 'ADMIN',
          email: 'admin',
          class_name: 'Administração',
          points: 0,
          is_admin: true,
        };
        return res.json({ user: adminUser });
      }
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const db = readDB();
    const user = db.users.find((u) => u.email === email);
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    res.json({ user: { ...publicUser(user), is_admin: false } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- User stats ----------

app.get('/api/user/stats/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const db = readDB();

    const user = db.users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const userDeposits = db.deposits.filter((d) => d.user_id === userId && d.status === 'approved');
    const totalDeposits = userDeposits.length;
    const todayDeposits = userDeposits.filter((d) => isSameDay(d.created_at)).length;

    const classPosition =
      db.users.filter((u) => u.class_name === user.class_name && u.points > user.points).length + 1;

    const classPoints = db.users
      .filter((u) => u.class_name === user.class_name)
      .reduce((sum, u) => sum + (u.points || 0), 0);

    res.json({
      totalPoints: user.points,
      totalDeposits,
      todayDeposits,
      classPosition,
      classPoints,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Deposits ----------

app.get('/api/deposits/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const db = readDB();

    const rows = db.deposits
      .filter((d) => d.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((d) => ({
        id: d.id,
        wasteType: d.item_type,
        quantity: d.quantity,
        weight: d.weight_delta,
        points: d.status === 'approved' ? d.points : 0,
        date: d.created_at,
        status: d.status,
      }));

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/deposits', (req, res) => {
  try {
    const { userId, wasteType, quantity, weight, description } = req.body;
    const db = readDB();

    const now = new Date().toISOString();
    const deposit = {
      id: uuidv4(),
      user_id: userId,
      item_type: wasteType,
      quantity: Number(quantity),
      weight_delta: Number(weight),
      status: 'pending',
      points: 0,
      description: description || '',
      created_at: now,
      updated_at: now,
      timestamp_client: now,
    };

    db.deposits.push(deposit);
    writeDB(db);

    res.json({ success: true, message: 'Depósito registrado e aguardando aprovação' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Admin: deposits history ----------

app.get('/api/admin/deposits/historico', (req, res) => {
  try {
    const db = readDB();

    const rows = db.deposits
      .filter((d) => d.status === 'approved' || d.status === 'rejected')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((d) => {
        const user = db.users.find((u) => u.id === d.user_id);
        return {
          id: d.id,
          user_id: d.user_id,
          userName: user?.name ?? '—',
          class_name: user?.class_name ?? '—',
          wasteType: d.item_type,
          quantity: d.quantity,
          weight: d.weight_delta,
          points: d.status === 'approved' ? d.points : 0,
          date: d.created_at,
          status: d.status,
        };
      });

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Leaderboard ----------

app.get('/api/leaderboard/global', (_req, res) => {
  try {
    const db = readDB();

    const rows = db.users
      .filter((u) => u.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 10)
      .map((u, i) => ({ rank: i + 1, name: u.name, points: u.points, class: u.class_name }));

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leaderboard/class/:className', (req, res) => {
  try {
    const { className } = req.params;
    const db = readDB();

    const rows = db.users
      .filter((u) => u.class_name === className && u.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 10)
      .map((u, i) => ({ rank: i + 1, name: u.name, points: u.points }));

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/ranking/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const db = readDB();

    const user = db.users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const global = db.users.filter((u) => u.points > user.points).length + 1;
    const classRank =
      db.users.filter((u) => u.class_name === user.class_name && u.points > user.points).length + 1;

    res.json({ global, class: classRank, points: user.points });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Admin ----------

app.get('/api/admin/global-stats', (_req, res) => {
  try {
    const db = readDB();

    const totalStudents = db.users.length;
    const totalClasses = new Set(db.users.map((u) => u.class_name)).size;
    const approved = db.deposits.filter((d) => d.status === 'approved');
    const totalDeposits = approved.length;
    const todayDeposits = approved.filter((d) => isSameDay(d.created_at)).length;

    res.json({ totalStudents, totalClasses, totalDeposits, todayDeposits });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/class-rankings', (req, res) => {
  try {
    const db = readDB();
    const classes = [...new Set(db.users.map((u) => u.class_name))];

    const result = classes.map((class_name) => {
      const ranking = db.users
        .filter((u) => u.class_name === class_name && u.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, 10)
        .map((u, i) => ({ rank: i + 1, name: u.name, points: u.points }));
      return { class_name, ranking };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/pending-deposits', (req, res) => {
  try {
    const db = readDB();

    const rows = db.deposits
      .filter((d) => d.status === 'pending')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((d) => {
        const user = db.users.find((u) => u.id === d.user_id);
        return {
          id: d.id,
          user_id: d.user_id,
          userName: user?.name ?? '—',
          class_name: user?.class_name ?? '—',
          wasteType: d.item_type,
          weight: d.weight_delta,
          date: d.created_at,
          status: d.status,
        };
      });

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/approve-deposit', (req, res) => {
  try {
    const { depositId, points } = req.body;
    const db = readDB();

    const deposit = db.deposits.find((d) => d.id === depositId);
    if (!deposit) return res.status(404).json({ error: 'Depósito não encontrado' });

    deposit.status = 'approved';
    deposit.points = points;
    deposit.updated_at = new Date().toISOString();

    const user = db.users.find((u) => u.id === deposit.user_id);
    if (user) user.points = (user.points || 0) + points;

    writeDB(db);
    res.json({ success: true, message: 'Depósito aprovado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reject-deposit', (req, res) => {
  try {
    const { depositId } = req.body;
    const db = readDB();

    const deposit = db.deposits.find((d) => d.id === depositId);
    if (!deposit) return res.status(404).json({ error: 'Depósito não encontrado' });

    deposit.status = 'rejected';
    deposit.updated_at = new Date().toISOString();

    writeDB(db);
    res.json({ success: true, message: 'Depósito rejeitado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/students', (req, res) => {
  try {
    const db = readDB();
    const students = [...db.users]
      .sort((a, b) => b.points - a.points)
      .map((u) => ({
        id: u.id,
        name: u.name,
        matricula: u.matricula,
        email: u.email,
        class_name: u.class_name,
        points: u.points,
        created_at: u.created_at,
      }));

    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/add-points', (req, res) => {
  try {
    const { userId, points, reason } = req.body;
    const db = readDB();

    const user = db.users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    user.points = (user.points || 0) + points;

    const now = new Date().toISOString();
    db.deposits.push({
      id: uuidv4(),
      user_id: userId,
      item_type: reason || 'Pontos manuais',
      quantity: 1,
      weight_delta: points / 10,
      status: 'approved',
      points,
      created_at: now,
      updated_at: now,
      timestamp_client: now,
    });

    writeDB(db);
    res.json({ success: true, message: 'Pontos adicionados com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`💾 Dados salvos em server/database/db.json (sem banco de dados externo)`);
  console.log(`📅 Senha admin de hoje: ${generateAdminPassword()}`);
});
