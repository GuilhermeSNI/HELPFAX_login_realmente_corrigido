# HELPFAX — Sistema de Estoque de Toners

Sistema simples de controle de estoque com Node.js, Express e PostgreSQL.

## Login padrão
- Usuário: `guilherme`
- Senha: `1234`

O servidor agora cria automaticamente as tabelas necessárias ao iniciar, desde que `DATABASE_URL` esteja configurada e o PostgreSQL esteja acessível.

## Executar

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

## Banco

Configure o `.env` a partir do `.env.example`:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/estoque_toner
JWT_SECRET=troque-esta-chave-por-uma-chave-grande-e-secreta
```

A logo HELPFAX fica em `public/images/helpax-logo.png` e aparece na tela de login e na página inicial.


## Importante — login corrigido

O projeto agora inclui `dotenv` no `package.json` e atualiza a senha do usuário padrão quando o servidor inicia.

### Login
Usuário: `guilherme`
Senha: `1234`

### Se abrir o `index.html` diretamente
O sistema entra automaticamente em **modo local/demonstração**, permitindo testar login, cadastro, entrada, saída, exclusão e histórico usando `localStorage`. Para usar o banco PostgreSQL real, execute com `npm install` e `npm start`, configure o `.env` e deixe o PostgreSQL disponível.
