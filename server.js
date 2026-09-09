require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "troque-esta-chave";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ erro: "Não autenticado." });

  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: "Sessão expirada ou inválida." });
  }
}

app.post("/api/login", async (req, res) => {
  try {
    const { login, senha } = req.body;
    const result = await pool.query(
      "SELECT id, nome, login, senha_hash FROM usuarios WHERE login = $1",
      [login]
    );

    if (!result.rows.length) {
      return res.status(401).json({ erro: "Usuário ou senha incorretos." });
    }

    const usuario = result.rows[0];
    const ok = await bcrypt.compare(senha, usuario.senha_hash);

    if (!ok) return res.status(401).json({ erro: "Usuário ou senha incorretos." });

    const token = jwt.sign(
      { id: usuario.id, nome: usuario.nome, login: usuario.login },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      usuario: { id: usuario.id, nome: usuario.nome, login: usuario.login }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: "Erro ao realizar login." });
  }
});

app.get("/api/categorias", auth, async (_req, res) => {
  const result = await pool.query("SELECT id, nome FROM categorias ORDER BY nome");
  res.json(result.rows);
});

app.get("/api/toners", auth, async (_req, res) => {
  const result = await pool.query(`
    SELECT t.id, c.nome AS categoria, t.categoria_id, t.modelo, t.cor, t.quantidade
    FROM toners t
    JOIN categorias c ON c.id = t.categoria_id
    ORDER BY c.nome, t.modelo, t.cor
  `);
  res.json(result.rows);
});

app.post("/api/toners", auth, async (req, res) => {
  const { categoria_id, modelo, cor, quantidade = 0 } = req.body;

  if (!categoria_id || !modelo || Number(quantidade) < 0) {
    return res.status(400).json({ erro: "Dados inválidos." });
  }

  try {
    const result = await pool.query(`
      INSERT INTO toners (categoria_id, modelo, cor, quantidade)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [categoria_id, modelo.trim(), cor || "Preto", Number(quantidade)]);

    res.status(201).json(result.rows[0]);
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ erro: "Esse modelo/cor já existe nessa categoria." });
    }
    console.error(e);
    res.status(500).json({ erro: "Erro ao cadastrar toner." });
  }
});

app.delete("/api/toners/:id", auth, async (req, res) => {
  try {
    await pool.query("DELETE FROM toners WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: "Erro ao excluir toner." });
  }
});

app.post("/api/movimentacoes", auth, async (req, res) => {
  const { toner_id, tipo, quantidade, observacao } = req.body;
  const qtd = Number(quantidade);

  if (!toner_id || !["ENTRADA", "SAIDA"].includes(tipo) || !Number.isInteger(qtd) || qtd <= 0) {
    return res.status(400).json({ erro: "Dados da movimentação inválidos." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tonerResult = await client.query(
      "SELECT id, quantidade FROM toners WHERE id = $1 FOR UPDATE",
      [toner_id]
    );

    if (!tonerResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ erro: "Toner não encontrado." });
    }

    const atual = tonerResult.rows[0].quantidade;
    const nova = tipo === "ENTRADA" ? atual + qtd : atual - qtd;

    if (nova < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ erro: "Estoque insuficiente." });
    }

    await client.query(
      "UPDATE toners SET quantidade = $1 WHERE id = $2",
      [nova, toner_id]
    );

    const mov = await client.query(`
      INSERT INTO movimentacoes
        (toner_id, usuario_id, tipo, quantidade, observacao)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [toner_id, req.usuario.id, tipo, qtd, observacao || null]);

    await client.query("COMMIT");

    res.status(201).json({
      movimentacao: mov.rows[0],
      nova_quantidade: nova
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ erro: "Erro ao registrar movimentação." });
  } finally {
    client.release();
  }
});

app.get("/api/movimentacoes", auth, async (_req, res) => {
  const result = await pool.query(`
    SELECT
      m.id,
      m.tipo,
      m.quantidade,
      m.observacao,
      m.data_movimentacao,
      t.modelo,
      t.cor,
      c.nome AS categoria,
      u.nome AS usuario
    FROM movimentacoes m
    JOIN toners t ON t.id = m.toner_id
    JOIN categorias c ON c.id = t.categoria_id
    JOIN usuarios u ON u.id = m.usuario_id
    ORDER BY m.data_movimentacao DESC
    LIMIT 300
  `);

  res.json(result.rows);
});

async function init() {
  // Garante que as tabelas existam antes de criar o usuário padrão.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      login VARCHAR(80) UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS categorias (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(80) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS toners (
      id SERIAL PRIMARY KEY,
      categoria_id INTEGER NOT NULL REFERENCES categorias(id),
      modelo VARCHAR(120) NOT NULL,
      cor VARCHAR(40) NOT NULL DEFAULT 'Preto',
      quantidade INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
      criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(categoria_id, modelo, cor)
    );

    CREATE TABLE IF NOT EXISTS movimentacoes (
      id SERIAL PRIMARY KEY,
      toner_id INTEGER NOT NULL REFERENCES toners(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA','SAIDA')),
      quantidade INTEGER NOT NULL CHECK (quantidade > 0),
      observacao TEXT,
      data_movimentacao TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  const senhaHash = await bcrypt.hash("1234", 12);

  await pool.query(`
    INSERT INTO usuarios (nome, login, senha_hash)
    VALUES ('Guilherme', 'guilherme', $1)
    ON CONFLICT (login) DO UPDATE
    SET nome = EXCLUDED.nome, senha_hash = EXCLUDED.senha_hash
  `, [senhaHash]);

  await pool.query(`
    INSERT INTO categorias (nome) VALUES
      ('Samsung'), ('Ricoh'), ('HP'), ('Kyocera'), ('Canon')
    ON CONFLICT (nome) DO NOTHING
  `);

  app.listen(PORT, () => {
    console.log(`Sistema rodando em http://localhost:${PORT}`);
    console.log('Login padrão: guilherme / 1234');
  });
}

init().catch(err => {
  console.error("Falha ao iniciar:", err);
  process.exit(1);
});