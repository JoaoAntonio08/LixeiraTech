// ...existing code...
// ...existing code...

// ...existing code...
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
dotenv.config();
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
                              user: process.env.DB_USER,
                              password: process.env.DB_PASS,
                              database: process.env.DB_NAME,
                              waitForConnections: true,
                              connectionLimit: 10,    // quantas conexões simultâneas
                              queueLimit: 0
});

export default pool;

// Função para gerar senha do admin baseada na data
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

// Verificar se usuário é admin
function isAdmin(user) {
  return user && user.email === 'admin';
}

// Auth endpoints
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, matricula, email, password, class_name } = req.body;

    // Check if user exists
    const [existing] = await pool.query(
      'SELECT * FROM user WHERE email = ? OR matricula = ?',
      [email, matricula]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Usuário já existe' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    // Insert user
    await pool.query(
      `INSERT INTO user (id, name, matricula, email, password_hash, class_name, points, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
                     [id, name, matricula, email, password_hash, class_name]
    );

    const [rows] = await pool.query(
      'SELECT id, name, matricula, email, class_name, points FROM user WHERE id = ?',
      [id]
    );

    res.json({ user: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
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
          is_admin: true
        };
        return res.json({ user: adminUser });
      } else {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }
    }

    const [rows] = await pool.query('SELECT * FROM user WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    delete user.password_hash;
    res.json({ user: { ...user, is_admin: false } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User stats endpoint
app.get('/api/user/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('[USER STATS] userId:', userId);
    const [users] = await pool.query('SELECT points, class_name FROM user WHERE id = ?', [userId]);
    const user = users[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const [[totalDeposits]] = await pool.query(
      "SELECT COUNT(*) as count FROM deposit WHERE user_id = ? AND status = 'approved'",
                                               [userId]
    );

    const [[todayDeposits]] = await pool.query(
      `SELECT COUNT(*) as count FROM deposit
      WHERE user_id = ? AND status = 'approved' AND DATE(created_at) = CURDATE()`,
                                               [userId]
    );

    const [[classPos]] = await pool.query(
      `SELECT COUNT(*) + 1 as position FROM user WHERE class_name = ? AND points > ?`,
                                          [user.class_name, user.points]
    );

    const [[classPts]] = await pool.query(
      `SELECT SUM(points) as total FROM user WHERE class_name = ?`,
                                          [user.class_name]
    );

    res.json({
      totalPoints: user.points,
      totalDeposits: totalDeposits.count,
      todayDeposits: todayDeposits.count,
      classPosition: classPos.position,
      classPoints: classPts.total,
    });
} catch (error) {
  res.status(500).json({ error: error.message });
}
});
// Deposits endpoints
app.get('/api/deposits/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await pool.query(
      `SELECT d.id, d.item_type as wasteType, d.quantity, d.weight_delta as weight,
      CASE WHEN d.status = 'approved' THEN d.points ELSE 0 END as points,
      d.created_at as date, d.status
      FROM deposit d WHERE d.user_id = ? ORDER BY d.created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/deposits', async (req, res) => {
  try {
    const { userId, wasteType, quantity, weight, description } = req.body;


    const id = uuidv4();
    const status = 'pending';
    const now = new Date();
    const weightNum = Number(weight);
    const quantityNum = Number(quantity);

    console.log("DEBUG deposit insert:", {
      id, userId, wasteType, quantityNum, weightNum, status, now
    });

    const [result] = await pool.query(
      `INSERT INTO deposit (id, user_id, item_type, quantity, weight_delta, status, created_at, updated_at, timestamp_client)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                      [id, userId, wasteType, quantityNum, weightNum, status, now, now, now]
    );
    console.log("DEBUG insert result:", result);

    res.json({ success: true, message: 'Depósito registrado e aguardando aprovação' });
  } catch (error) {
    console.error("DEBUG insert error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Admin Deposits History Endpoint

app.get('/api/admin/deposits/historico', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
      d.id,
      d.user_id,
      u.name AS userName,
      u.class_name,
      d.item_type AS wasteType,
      d.quantity, -- agora vem da tabela deposit
      d.weight_delta AS weight,
      CASE WHEN d.status = 'approved' THEN d.points ELSE 0 END AS points,
      d.created_at AS date,
      d.status
      FROM deposit d
      JOIN user u ON d.user_id = u.id
      WHERE d.status IN ('approved', 'rejected')
      ORDER BY d.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error("Erro ao buscar histórico de depósitos:", error);
    res.status(500).json({ error: error.message });
  }
});
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Leaderboard endpoints
app.get('/api/leaderboard/global', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
    SELECT ROW_NUMBER() OVER (ORDER BY points DESC) as rank,
                                    name, points, class_name as class
                                    FROM user WHERE points > 0
                                    ORDER BY points DESC LIMIT 10
                                    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leaderboard/class/:className', async (req, res) => {
  try {
    const { className } = req.params;
    const [rows] = await pool.query(
      `SELECT ROW_NUMBER() OVER (ORDER BY points DESC) as rank, name, points
      FROM user WHERE class_name = ? AND points > 0
      ORDER BY points DESC LIMIT 10`,
      [className]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/ranking/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const [userRows] = await pool.query(
      'SELECT points, class_name FROM user WHERE id = ?',
      [userId]
    );
    const user = userRows[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const [[globalPositionRow]] = await pool.query(
      'SELECT COUNT(*) + 1 AS position FROM user WHERE points > ?',
                                                   [user.points]
    );

    const [[classPositionRow]] = await pool.query(
      'SELECT COUNT(*) + 1 AS position FROM user WHERE class_name = ? AND points > ?',
                                                  [user.class_name, user.points]
    );

    res.json({
      global: globalPositionRow.position,
      class: classPositionRow.position,
      points: user.points
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoints
// Endpoint: Ranking global para admin (igual ao global normal)
app.get('/api/admin/global-stats', async (_req, res) => {
  try {
    // Total de alunos, turmas, depósitos e depósitos de hoje
        const [[students]] = await pool.query('SELECT COUNT(*) as count FROM user');
        const [[classes]] = await pool.query('SELECT COUNT(DISTINCT class_name) as count FROM user');
        const [[deposits]] = await pool.query("SELECT COUNT(*) as count FROM deposit WHERE status = 'approved'");
        const [[today]] = await pool.query(
          "SELECT COUNT(*) as count FROM deposit WHERE status = 'approved' AND DATE(created_at) = CURDATE()"
        );

        res.json({
          totalStudents: students.count,
          totalClasses: classes.count,
          totalDeposits: deposits.count,
          todayDeposits: today.count,
        });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: Ranking por turma para admin (todas as turmas)
app.get('/api/admin/class-rankings', async (req, res) => {
  try {
    const [classes] = await pool.query('SELECT DISTINCT class_name FROM user');
    const result = [];

    for (const turma of classes) {
      const [ranking] = await pool.query(`
      SELECT
      @rownum := @rownum + 1 AS rank,
      name,
      points
      FROM (SELECT @rownum := 0) r, user
      WHERE class_name = ? AND points > 0
      ORDER BY points DESC
      LIMIT 10
      `, [turma.class_name]);
      result.push({ class_name: turma.class_name, ranking });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/admin/pending-deposits', async (req, res) => {
  try {
    const [deposits] = await pool.query(`
    SELECT
    d.id,
    d.user_id,
    u.name AS userName,
    u.class_name,
    d.item_type AS wasteType,
    d.weight_delta AS weight,
    d.created_at AS date,
    d.status
    FROM deposit d
    JOIN user u ON d.user_id = u.id
    WHERE d.status = 'pending'
    ORDER BY d.created_at DESC
    `);

    res.json(deposits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/approve-deposit', async (req, res) => {
  try {
    const { depositId, points } = req.body;

    const [[deposit]] = await pool.query('SELECT * FROM deposit WHERE id = ?', [depositId]);
    if (!deposit) return res.status(404).json({ error: 'Depósito não encontrado' });

    await pool.query('UPDATE deposit SET status = ?, points = ? WHERE id = ?', ['approved', points, depositId]);
    await pool.query('UPDATE user SET points = points + ? WHERE id = ?', [points, deposit.user_id]);

    res.json({ success: true, message: 'Depósito aprovado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reject-deposit', async (req, res) => {
  try {
    const { depositId } = req.body;
    await pool.query('UPDATE deposit SET status = ? WHERE id = ?', ['rejected', depositId]);
    res.json({ success: true, message: 'Depósito rejeitado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/students', async (req, res) => {
  try {
    const [students] = await pool.query(`
    SELECT
    id,
    name,
    matricula,
    email,
    class_name,
    points,
    created_at
    FROM user
    ORDER BY points DESC
    `);
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/add-points', async (req, res) => {
  try {
    const { userId, points, reason } = req.body;
    const id = uuidv4();

    await pool.query('UPDATE user SET points = points + ? WHERE id = ?', [points, userId]);
    await pool.query(`
    INSERT INTO deposit (
      id, user_id, item_type, weight_delta, status, points,
      created_at, updated_at, timestamp_client
    )
    VALUES (?, ?, ?, ?, 'approved', ?, NOW(), NOW(), NOW())
    `, [id, userId, reason || 'Pontos manuais', points / 10, points]);

    res.json({ success: true, message: 'Pontos adicionados com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`📅 Senha admin de hoje: ${generateAdminPassword()}`);
});
