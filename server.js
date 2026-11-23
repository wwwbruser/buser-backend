const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// ==========================================
// 1. CONFIGURAÇÃO DO FIREBASE
// ==========================================
// O Render vai puxar essas variáveis da aba "Environment"
const privateKey = process.env.FIREBASE_PRIVATE_KEY 
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
  : undefined;

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
    // ATENÇÃO: Substitua pela URL do SEU banco de dados (veja no console do Firebase)
    databaseURL: "https://tela-buser-default-rtdb.firebaseio.com" 
  });
  console.log("✅ Firebase conectado com sucesso!");
} catch (error) {
  console.error("❌ Erro ao conectar no Firebase:", error);
}

// ==========================================
// 2. CONFIGURAÇÃO DO SERVIDOR (EXPRESS + CORS)
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000; // O Render usa a porta 10000 por padrão

// Libera o acesso para o seu site no GitHub Pages (resolvi o erro "Failed to fetch")
app.use(cors({
  origin: 'https://wwwbruser.github.io' 
}));

// Permite que o servidor entenda JSON
app.use(express.json());

// ==========================================
// 3. SUAS ROTAS (Aqui você coloca o que seu servidor faz)
// ==========================================

// Rota de teste para ver se o servidor está vivo
app.get('/', (req, res) => {
  res.send('Servidor Buser está rodando!');
});

// Exemplo de rota: Buscar viagens no banco
app.get('/viagens', async (req, res) => {
  try {
    const db = admin.database();
    const ref = db.ref('viagens'); // O nome da sua pasta no Firebase
    const snapshot = await ref.once('value');
    res.json(snapshot.val());
  } catch (error) {
    console.error("Erro ao buscar viagens:", error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
