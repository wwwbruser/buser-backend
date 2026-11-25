const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// ... (sua configuração do Firebase permanece a mesma) ...

const app = express();
const PORT = process.env.PORT || 10000;

// 1. Lista explícita de origens permitidas
const allowedOrigins = [
  'https://wwwbruser.github.io', // Sua origem exata
  'https://bruser.github.io',    // Caso você use sem o "www"
  'http://localhost:3000',       // Para testes locais
  'http://127.0.0.1:5500'        // Para o Live Server do VSCode
];

// 2. Middleware de CORS configurado
app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem origem (ex: Postman) ou se a origem estiver na lista
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origem bloqueada pela política de CORS: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Permite o envio de cookies/credenciais
  maxAge: 86400 // Cache do preflight por 24 horas
}));

// 3. Adiciona o cabeçalho Vary para evitar cache incorreto
app.use((req, res, next) => {
  res.setHeader('Vary', 'Origin');
  next();
});

// 4. Permite que o Express entenda JSON
app.use(express.json());

// ... (suas rotas permanecem as mesmas) ...
