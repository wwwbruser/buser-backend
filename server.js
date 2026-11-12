const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin'); // Novo: Para o Worker ler

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURAÇÃO DO FIREBASE (ADMIN) ---
// Você precisa baixar a chave de serviço do Firebase e colocar nas variáveis de ambiente do Render
// Se não tiver, use a configuração pública para teste (menos seguro, mas funciona)
const firebaseConfig = {
  apiKey: "AIzaSyCmoxq5NMQUj1hqyWhjaJz4Uw4grhsFFhA",
  authDomain: "projeto-link-ddbf0.firebaseapp.com",
  databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com",
  projectId: "projeto-link-ddbf0",
  storageBucket: "projeto-link-ddbf0.firebasestorage.app",
  messagingSenderId: "560317126646",
  appId: "1:560317126646:web:be9cad9c9ed350940399d7"
};

// Inicializa o Firebase Admin (para o Worker ler)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: firebaseConfig.databaseURL
  });
}
const db = admin.database();

app.get('/api/clickbus/search', async (req, res) => {
    const { origem, destino, data } = req.query;
    
    if (!origem || !destino || !data) {
        return res.status(400).json({ error: 'Faltando parâmetros.' });
    }

    const pedidoId = uuidv4();

    // Salva o pedido no Firebase (na fila)
    try {
        await db.ref(`fila_pedidos/${pedidoId}`).set({
            status: 'processando',
            origem,
            destino,
            data,
            criadoEm: Date.now()
        });

        console.log(`📥 Pedido ${pedidoId} enfileirado no Firebase.`);
        
        // Responde IMEDIATAMENTE
        res.status(202).json({ message: 'Busca em andamento.', pedidoId });
    } catch (error) {
        console.error('Erro ao enfileirar:', error);
        res.status(500).json({ error: 'Erro ao criar pedido.' });
    }
});

app.get('/api/clickbus/resultado/:pedidoId', async (req, res) => {
    const { pedidoId } = req.params;
    try {
        const snapshot = await db.ref(`fila_pedidos/${pedidoId}`).once('value');
        const pedido = snapshot.val();

        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
        if (pedido.status === 'processando') return res.status(202).json({ status: 'processando' });
        if (pedido.status === 'erro') return res.status(500).json({ status: 'erro', message: pedido.erro });

        res.json({ status: 'concluido', data: pedido.resultado });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao consultar.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web Service rodando na porta ${PORT}`));
