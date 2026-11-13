const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// 🔒 FIREBASE (USANDO O JSON COMPLETO DA VARIÁVEL DE AMBIENTE)
// ============================================================
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Admin inicializado com sucesso.");
  } catch (error) {
    console.error("❌ ERRO CRÍTICO no Firebase:", error.message);
  }
}
const db = admin.database();

// ============================================================
// ROTAS DO WEB SERVICE (RESPOSTA RÁPIDA)
// ============================================================
app.get('/api/clickbus/search', async (req, res) => {
    const { origem, destino, data } = req.query;
    if (!origem || !destino || !data) return res.status(400).json({ error: 'Faltando parâmetros.' });

    const pedidoId = uuidv4();
    try {
        await db.ref(`fila_pedidos/${pedidoId}`).set({ status: 'processando', origem, destino, data, criadoEm: Date.now() });
        console.log(`📥 Pedido ${pedidoId} enfileirado.`);
        res.status(202).json({ message: 'Busca em andamento.', pedidoId });
    } catch (error) {
        console.error('Erro ao enfileirar:', error.message);
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
// WORKER (PROCESSA A FILA COM A GECKOAPI)
// ============================================================
console.log('Worker iniciado. Aguardando pedidos na fila...');

db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();
    if (pedido.status !== 'processando') return;

    console.log(`\n⚙️ Processando pedido ${pedidoId} (${pedido.origem} -> ${pedido.destino})`);

    try {
        const [origemCidade, origemUF] = pedido.origem.split(',').map(s => s.trim());
        const [destinoCidade, destinoUF] = pedido.destino.split(',').map(s => s.trim());

        let resultado = null;
        try {
            const response = await axios.post(
                'https://api.geckoapi.com.br/v1/extract',
                {
                    target: 'clickbus.com.br',
                    type: 'plp',
                    originCity: origemCidade,
                    originState: origemUF,
                    destinationCity: destinoCidade,
                    destinationState: destinoUF,
                    departureDate: pedido.data,
                    page: 1
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.GECKO_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            );

            let viagens = response.data.data || response.data.trips || [];
            if (Array.isArray(viagens) && viagens.length > 0) {
                resultado = viagens.map(trip => ({
                    id: trip.id || Math.random().toString(),
                    company: { name: trip.travelCompany?.name || trip.company?.name || "Viação Parceira", logo: trip.travelCompany?.logo || "" },
                    price: Number(trip.price || 0),
                    bus_type: trip.bus_type || "Convencional",
                    total_seats: 46,
                    occupied_seats: [],
                    departure: { time: trip.departure?.time || "--:--", city: origemCidade, terminal: { name: trip.departure?.place?.name || "Terminal Principal", address: "" } },
                    arrival: { time: trip.arrival?.time || "--:--", city: destinoCidade, terminal: { name: trip.arrival?.place?.name || "Terminal Principal", address: "" } }
                }));
            }
        } catch (e) {
            console.error('❌ Erro na GeckoAPI:', e.response?.data || e.message);
        }

        if (!resultado || resultado.length === 0) {
            console.log('⚠️ GeckoAPI falhou ou não retornou. Usando Modo Demonstração.');
            resultado = [
                { id: 'demo-1', company: { name: 'Catedral', logo: '' }, bus_type: 'Executivo', price: 150.00, total_seats: 46, occupied_seats: [], departure: { time: '08:00', city: origemCidade, terminal: { name: 'Rodoviária Principal', address: '' } }, arrival: { time: '14:15', city: destinoCidade, terminal: { name: 'Terminal Rodoviário', address: '' } } },
                { id: 'demo-2', company: { name: 'Nacional', logo: '' }, bus_type: 'Convencional', price: 180.00, total_seats: 46, occupied_seats: [], departure: { time: '14:00', city: origemCidade, terminal: { name: 'Rodoviária Principal', address: '' } }, arrival: { time: '19:45', city: destinoCidade, terminal: { name: 'Terminal Rodoviário', address: '' } } }
            ];
        }

        await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'concluido', resultado, concluidoEm: Date.now() });
        console.log(`✅ Pedido ${pedidoId} concluído com ${resultado.length} viagens.`);

    } catch (error) {
        console.error(`❌ Falha no pedido ${pedidoId}:`, error);
        await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro', erro: 'Erro interno.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
