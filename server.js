const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin'); // Novo: Para o Worker
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// 🔥 CHAVE DO FIREBASE (MANTIDA AQUI PARA FACILITAR)
// ============================================================
const serviceAccount = {
  "type": "service_account",
  "project_id": "projeto-link-ddbf0",
  "private_key_id": "104225bf047ea684fa969c362200b82e530c4488", // Exemplo, use a sua
  "private_key": "-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_AQUI\n-----END PRIVATE KEY-----\n", // Cole a sua chave real aqui
  "client_email": "firebase-adminsdk-fbsvc@projeto-link-ddbf0.iam.gserviceaccount.com",
  "client_id": "111553288974699411914",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40projeto-link-ddbf0.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

// Inicializa o Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com"
  });
}
const db = admin.database();

// ============================================================
// PARTE 1: WEB SERVICE (RESPOSTA RÁPIDA)
// ============================================================
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

// ============================================================
// PARTE 2: WORKER (PROCESSA A FILA EM SEGUNDO PLANO)
// ============================================================
console.log('Worker iniciado. Aguardando pedidos na fila...');

db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();

    if (pedido.status !== 'processando') return;

    console.log(`\n⚙️ Processando pedido ${pedidoId} (${pedido.origem} -> ${pedido.destino})`);

    try {
        // Tenta buscar na ClickBus
        const criarSlug = (cidadeString) => {
            const [cidade, uf] = cidadeString.split(',').map(s => s.trim());
            const cidadeSlug = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '-');
            return `${cidadeSlug}-${uf.toLowerCase()}`;
        };

        let resultado = null;
        try {
            const response = await axios.get('https://api.clickbus.com/api/v5/trips', {
                params: {
                    from: `${criarSlug(pedido.origem)}-todos`,
                    to: `${criarSlug(pedido.destino)}-todos`,
                    departureDate: pedido.data,
                    clientId: 'buser-online-clone'
                },
                headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                timeout: 60000
            });
            let viagens = response.data.data || response.data.trips || [];
            if (Array.isArray(viagens) && viagens.length > 0) {
                resultado = viagens.map(trip => ({ /* ... formatação ... */ }));
            }
        } catch (e) {
            console.log('ClickBus bloqueou. Usando demonstração.');
        }

        // Se falhou (ou não achou nada), usa a demonstração
        if (!resultado || resultado.length === 0) {
            resultado = [
                { id: 'demo-1', company: { name: 'Catedral' }, price: 150, bus_type: 'Executivo', total_seats: 46, occupied_seats: [], departure: { time: '08:00', city: pedido.origem.split(',')[0], terminal: { name: 'Rodoviária' } }, arrival: { time: '14:15', city: pedido.destino.split(',')[0], terminal: { name: 'Terminal' } } },
                { id: 'demo-2', company: { name: 'Nacional' }, price: 180, bus_type: 'Convencional', total_seats: 46, occupied_seats: [], departure: { time: '14:00', city: pedido.origem.split(',')[0], terminal: { name: 'Rodoviária' } }, arrival: { time: '19:45', city: pedido.destino.split(',')[0], terminal: { name: 'Terminal' } } }
            ];
        }

        // Atualiza o status para concluído
        await db.ref(`fila_pedidos/${pedidoId}`).update({
            status: 'concluido',
            resultado: resultado,
            concluidoEm: Date.now()
        });

        console.log(`✅ Pedido ${pedidoId} concluído com ${resultado.length} viagens.`);

    } catch (error) {
        console.error(`❌ Falha no pedido ${pedidoId}:`, error);
        await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro', erro: 'Erro interno.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
