const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// ==========================================
// 1. CONFIGURAÇÃO DO FIREBASE
// ==========================================
try {
  // Lê a variável de ambiente exata que você criou no Render
  const serviceAccountJson = process.env.FIREBASE_CREDENTIALS;
  
  if (!serviceAccountJson) {
    throw new Error("A variável FIREBASE_CREDENTIALS não foi encontrada nas configurações do Render.");
  }

  // Transforma o texto da variável de volta em um objeto JSON
  const serviceAccount = JSON.parse(serviceAccountJson);

  // Corrige a quebra de linha da chave privada
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  // Inicializa o Firebase
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // ⚠️ IMPORTANTE: Substitua pela URL exata do seu banco no Firebase
    databaseURL: "https://tela-buser-default-rtdb.firebaseio.com" 
  });
  
  console.log("✅ Firebase conectado com sucesso!");
} catch (error) {
  console.error("❌ Erro ao conectar no Firebase:", error.message);
}

// ==========================================
// 2. CONFIGURAÇÃO DO SERVIDOR (EXPRESS + CORS)
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000; // O Render usa a porta 10000

// Libera o acesso para o seu site no GitHub Pages
app.use(cors({
  origin: 'https://wwwbruser.github.io' 
}));

// Permite que o servidor entenda requisições com JSON no corpo
app.use(express.json());

// ==========================================
// 3. SUAS ROTAS
// ==========================================

// Rota raiz apenas para testar se o servidor está online
app.get('/', (req, res) => {
  res.send('Servidor Buser está rodando e pronto para os testes!');
});

// Rota de exemplo (Substitua pela rota que seu frontend realmente usa)
app.get('/api/viagens', async (req, res) => {
  try {
    const db = admin.database();
    // ⚠️ Troque 'viagens' pelo nome da pasta/nó que está no seu Realtime Database
    const ref = db.ref('viagens'); 
    const snapshot = await ref.once('value');
    
    if (snapshot.exists()) {
      res.json(snapshot.val());
    } else {
      res.json({ mensagem: "Nenhuma viagem encontrada no banco." });
    }
  } catch (error) {
    console.error("Erro ao buscar viagens:", error);
    res.status(500).json({ error: 'Erro interno ao buscar dados' });
  }
});

// ==========================================
// 4. INICIALIZAÇÃO DO SERVIDOR
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
