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

INSERT INTO categorias (nome) VALUES
  ('Samsung'), ('Ricoh'), ('HP'), ('Kyocera'), ('Canon')
ON CONFLICT (nome) DO NOTHING;