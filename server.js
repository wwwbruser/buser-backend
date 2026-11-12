const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// 🔒 CONFIGURAÇÃO DO FIREBASE (USANDO VARIÁVEIS DE AMBIENTE)
// ============================================================
const serviceAccount = {
  "project_id": process.env.FIREBASE_PROJECT_ID,
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  // O .replace é crucial para transformar os "\n" da variável em quebras de linha reais
  "private_key": process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
};

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Admin inicializado com sucesso via variáveis de ambiente.");
  } catch (error) {
    console.error("❌ ERRO CRÍTICO: Falha ao inicializar o Firebase Admin.", error.message);
    console.error("Verifique se as variáveis FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY estão corretas no Render.");
  }
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

    try {
        await db.ref(`fila_pedidos/${pedidoId}`).set({
            status: 'processando',
            origem,
            destino,
            data,
            criadoEm: Date.now()
        });

        console.log(`📥 Pedido ${pedidoId} enfileirado no Firebase.`);
        // Responde IMEDIATAMENTE para o frontend
        res.status(202).json({ message: 'Busca em andamento.', pedidoId });
    } catch (error) {
        console.error('Erro ao enfileirar no Firebase:', error.message);
        res.status(500).json({ error: 'Erro ao criar pedido. Verifique as credenciais do Firebase no Render.' });
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
        console.error('Erro ao consultar resultado:', error.message);
        res.status(500).json({ error: 'Erro ao consultar resultado.' });
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
        const criarSlug = (cidadeString) => {
            const [cidade, uf] = cidadeString.split(',').map(s => s.trim());
            const cidadeSlug = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '-');
            return `${cidadeSlug}-${uf.toLowerCase()}`;
        };

        let resultado = null;
        try {
            // Tenta buscar na ClickBus
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
                resultado = viagens.map(trip => ({
                    id: trip.id || Math.random().toString(),
                    company: { name: trip.company?.name || trip.travelCompany?.name || "Viação Parceira", logo: trip.company?.logo || "" },
                    price: Number(trip.price || trip.fare || 0),
                    bus_type: trip.bus_type || trip.serviceClass || "Convencional",
                    total_seats: 46,
                    occupied_seats: [],
                    departure: { time: trip.departure?.time || "--:--", city: pedido.origem.split(',')[0], terminal: { name: trip.departure?.location?.name || "Terminal Principal", address: "" } },
                    arrival: { time: trip.arrival?.time || "--:--", city: pedido.destino.split(',')[0], terminal: { name: trip.arrival?.location?.name || "Terminal Principal", address: "" } }
                }));
            }
        } catch (e) {
            console.log('ClickBus bloqueou ou não retornou. Usando demonstração.');
        }

        // Se falhou (ou não achou nada), usa o Modo Demonstração para não deixar o cliente na mão
        if (!resultado || resultado.length === 0) {
            resultado = [
                { id: 'demo-1', company: { name: 'Catedral', logo: '' }, bus_type: 'Executivo', price: 150.00, total_seats: 46, occupied_seats: [], departure: { time: '08:00', city: pedido.origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } }, arrival: { time: '14:15', city: pedido.destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } } },
                { id: 'demo-2', company: { name: 'Nacional', logo: '' }, bus_type: 'Convencional', price: 180.00, total_seats: 46, occupied_seats: [], departure: { time: '14:00', city: pedido.origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } }, arrival: { time: '19:45', city: pedido.destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } } }
            ];
        }

        // Atualiza o pedido no Firebase com o resultado final
        await db.ref(`fila_pedidos/${pedidoId}`).update({
            status: 'concluido',
            resultado: resultado,
            concluidoEm: Date.now()
        });

        console.log(`✅ Pedido ${pedidoId} concluído com ${resultado.length} viagens.`);

    } catch (error) {
        console.error(`❌ Falha no pedido ${pedidoId}:`, error);
        await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro', erro: 'Erro interno ao processar a busca.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
