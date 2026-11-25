const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// ==========================================
// 1. CONFIGURAÇÃO DO FIREBASE
// ==========================================
try {
  const serviceAccount = {
    type: "service_account",
    project_id: "tela-buser", 
    private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC23mr0rWvK8r53\nuIG0W6AU8ugOH1G3VeJaPY0duB5IHG8VAXBsY9GW/G121KVMmJWJ5qn3wf0qZZ3K\nTWgzyYVD2hu2shd222ucZ37v0rsUQf5YJ/0ExQyhDmZABdoJcjVoBxUSr6KaQAwe\nv7fv1auVE06ylD6B/CYDD2HnKenIxFECJYOFOJHZKGypjMSgxVRz2M0IzFyk80y3\nlEu2lCVy0qjeAveRoPmWoP06gtVVwjcS8mFizHrFr9s8FTmAxDWQlzQGfOgOle4J\npwwZci17eCJU/IFZsDnE1OBxFvi/0fH+M8m1bphE+GOn1dG6WMgltGtU08lCGbwa\ngPmQB0krAgMBAAECggEACTLB3YHVoLU6GGqK96f+Mt+PBZrUsOycgJ6E+SA4QbdQ\nbRWP8pvIwJf855PFpscsCm40UXaMBfRrje/71FMIJYQUjcmCfaOG06yvCWAnsdqp\n8QQ96V4CBx3izcidkYkRn6RvjmuQOcML+QX6uhEc2thIRppHVKF6xf+hlI+ap1MG\n3JpyWTKi65ys5SptwTBjunhZ4QJNTfDffC8yN8RAezhtJMpJp3b3l6NZQA6Et9Rm\n2c3CyvkToHWNahN8m/domkzJNPV+u/zAlDb5ajIeBDNb8r54jD3MibvK3tei1/9c\nrmfb9vvmlurtDCQByCP1v8ee9HAZRU6Zoc/aQKn7jQKBgQDc9nRKXDV9eV5IGelh\n1FCZaFUrj38O8WszEhSTsGvhqmVQt6PVo+aMkEo3/H+2fiWqZNDIhvQRE2IA4gNj\nBMP8/EnUWl7pXNGeuLgS15HMJszuHtRcRP1l36KLBXeHQccgxrjYMfvBI4SGm7nP\nNnQuHWVbFpuuKh5mIYMHZLLx3wKBgQDT3Z33wsa65InrQwDaidBpl65QzEP/wKRf\nnKuuUdZk1B8xJhD5VSjP/erpeiM19RLPD9r1pF5nev9jpDO4oOMYBjw/5CG/DhCG\nsF8GNokxRkXZOh+oTnzzOlK1gwlG4vFovumxpt8DLUtUIYAALIwyTSmxEYXTTlo9\nIPyyzIeKNQKBgQDK0tsKCrv60fZOHqLQbvAQ8OkFFDHgCJCLD3Sd4JoWSa+4OOkF\nSO5uZmAKJhcg74gpcWMIPoA4UF9sSgor0QsJ5JbseouWj+HGXO5yNTgaeh8wEFKD\n47vp0C7Gh50hJargFilEIhViQvT6DmWvo99fGRKZWxZJ91VyEB7TIYb0ZwKBgF2M\nu9XM0Ydwpl2VZmkY9UfKzBOtPlFNtMbrHPuJ80ruRx+imVge/Dhq/DE/1xBaOIXp\nkFtqyqySqPZMaPIbSGsxRaVIjIYaJb3zXuIVbpqtVuZGPfhJP+7+T8sKIyyDxOjl\nc7cX4d07QMnTSPvKr9T+MWyYOilFrZ7UVAB3Q1oJAoGAKqTNbBGQrlhHWeA5jC1g\nUlRclvgLsa+ihBSv6AO8h3E0BUjac74islXLETBbG2Bv8BwBq1bnqrf2b4urUElX\niVESXxIbqSDq8NWgZIGtuKu2riPEU5qfpuOtVMGeechP4VrC6zZFQCQaAFjmp8oL\nrgXfZT1D+b32Q6fLENhXmBg=\n-----END PRIVATE KEY-----\n",
    client_email: "firebase-adminsdk-fbsvc@tela-buser.iam.gserviceaccount.com" 
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://tela-buser-default-rtdb.firebaseio.com"
  });
  
  console.log("✅ Firebase conectado com sucesso!");
} catch (error) {
  console.error("❌ Erro ao conectar no Firebase:", error.message);
}

// ==========================================
// 2. CONFIGURAÇÃO DO SERVIDOR E CORS
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;

// Configuração explícita do CORS para permitir o seu front-end
const corsOptions = {
  origin: [
    'https://www.bruser.github.io', 
    'https://bruser.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:5500' // Caso você use o Live Server no VSCode
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());

// Middleware para logar todas as requisições que chegam no servidor
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Recebida requisição: ${req.method} ${req.url}`);
  next();
});

// Rota raiz (para testes)
app.get('/', (req, res) => {
  res.send('Servidor Buser está rodando perfeitamente!');
});

// ==========================================
// 3. ROTA DE BUSCA
// ==========================================
app.get('/api/clickbus/search', async (req, res) => {
  try {
    const { origem, destino, data } = req.query;
    console.log(`🔍 Buscando viagens de ${origem} para ${destino} na data ${data}`);

    if (!origem || !destino || !data) {
      return res.status(400).json({ error: 'Faltando parâmetros: origem, destino ou data.' });
    }

    // Simulando um ID de pedido para o site começar o monitoramento
    const pedidoId = "simulacao_" + Date.now();

    res.json({
      pedidoId: pedidoId,
      mensagem: "Busca iniciada com sucesso."
    });
  } catch (error) {
    console.error("Erro na busca:", error);
    // Importante retornar JSON no erro para o front-end não quebrar
    res.status(500).json({ error: 'Erro interno no servidor ao processar a busca.' });
  }
});

// ==========================================
// 4. ROTA DE RESULTADO
// ==========================================
app.get('/api/clickbus/resultado/:pedidoId', async (req, res) => {
  try {
    // Aqui você colocaria a lógica real de pegar as viagens
    // Por enquanto, retornamos "concluido" e uma lista vazia para o site não travar
    
    res.json({
      status: 'concluido',
      data: [], // Lista vazia significa "Nenhuma passagem encontrada" no frontend
      mensagem: "Nenhuma passagem encontrada."
    });
  } catch (error) {
    console.error("Erro no resultado:", error);
    res.status(500).json({ error: 'Erro interno no servidor ao buscar resultados.' });
  }
});

// ==========================================
// 5. INICIALIZAÇÃO
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
