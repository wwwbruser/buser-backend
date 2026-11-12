const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// 🔥 CHAVE DO FIREBASE (COLE A SUA CHAVE AQUI)
// ============================================================
const serviceAccount = {
  "type": "service_account",
  "project_id": "projeto-link-ddbf0",
  "private_key_id": "104225bf047ea684fa969c362200b82e530c4488",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC5gHVC5UhYf4tr\nh7l7KMh5QXOtwkPZOZdukA2/YsJSJ1NIfB5s5N0mYQQSmT5NjcTSqAcLKTsUeDi4\n/KcFj4AR6UDRbeq+wxe7zYN5hWxrSmzzAe8NRsIFuQmWQ38nGvsX/UMZWPh8qn4O\n5NRFSxAptqmpzqo266W4ukkuDhafdxnGNtwj8zq7/A+3HnqwaAP5bFPMPihTZKSP\nxQq5J5YBLKUFTKxhsJMVDga6h2FTFQ3pRFmcIAtUZlHbkqDZretXXlOpCgklx9ui\nWeERW7dl7LwdIiu7ibICUIL3WxqXnhi6Bbt3VvUXr5hlS8z3Q2XyHUZFBs8kz2ih\nJv2gLHGLAgMBAAECggEAVXjoDuPAmu5h2jEWeLYI8T4ERBrP0mZj7RC5FOc3bE0s\nZaizCC/H6mgnTT6I44kgGIRNgooD6+GdGTdo6fn948LbF+SSlkUkSWdfXf3pP+Jy\nIuJQOIjS23ov/amqC+W1ro8GfMZu8FpKbSho2mjE0MOWl2RfL6ESofRLxcm+CMk6\nI0M4+RHiDedLXg7X2IAYgJkMYRG6Ejp9mgzibVS1f9d+yj5zK382O1izzyMXMDYS\n5pebv0NPGpk6ZP1nCUAMhYThs+XuVyW6b20cAXADdG0cv2Dcw2y2V7xGuGX4Z62y\nFw4rIQvGeTkTNnwmOWYNyhhptILznLVi85RKAfgf2QKBgQDc5Y89ZxTvm0fGzfEI\n+wrFg09grREQRQJGQ2ZK63KGELkfdtop8D3ev3UHUDf4AGxoxE93ctZSUBLWJ6FG\n7R8eK4t4tbzSyQ2EkRIB4LhkfPzY9DSdo/ga7VRMZqi00GvE6cHaMAPlwz33UZT1\n93uq/Y9ArnVtecekVl6b4yOqJQKBgQDW+vmQK7CHrVH+E1XMdXxMMqJ7R9Ex5YAM\n0smus8gLkY+RpdXL4rcC4jea4UldNKvKE23OUxuZ40B+SWfcPLahpojPOkebScNF\nR7G6j9VgfMYzgctLrPVDlxQDujkb+6fQFMvgigtio86d89XLVEh+9SWAndyRoQ1Z\nE02JFMBl7wKBgEBPdQxjXm0DwDnY6zu6GsC2If37ZORfsvHR3Y4iTg1KARtv9sQO\n9XRMOT4P1LuXI/i8boZQIKWGOnWuw/1qO40FEG3sOzUC47Scp6l0Szq2SMbBEjBy\n9GCih9BWcvdxVm7Vv2JOaFQUK449aijSDGcTuwkRwY5FziHCI3ku/8shAoGBAIaJ\nrmERVnqydxugkhNQeydckN7CBSNK0yYzTFBu5oSG5ehqdjAQhCPj2pSs5LLV4aSn\nIBL9Y8qcs6HU4pCr1ke35up5OJLwSKo0wf9VQF4P+CIH2mhTp3JTPA1RH6hph43r\nVeQBwDpM9WNYU7XZ2zzIwl2JbZ4dwjK6p81gFUA1AoGAFzwjUHxnytuQHYjX5BgT\nNZEH0wAtf7+Gqkua8KhTBnQtG2Lgps//18vYCt9UaQKxVKDbtbzwH05bQvLbtz1B\nQenPBLPhPhPmXTsYML+HHpb/p1ySbNtbSUtZdpjYSLBjKtkV2JFXWuFyJH2JTh0l\nCPVfKEWW5ovSb91Mk6BhmCk=\n-----END PRIVATE KEY-----\n",
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

    try {
        await db.ref(`fila_pedidos/${pedidoId}`).set({
            status: 'processando',
            origem,
            destino,
            data,
            criadoEm: Date.now()
        });

        console.log(`📥 Pedido ${pedidoId} enfileirado no Firebase.`);
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

        if (!resultado || resultado.length === 0) {
            resultado = [
                { id: 'demo-1', company: { name: 'Catedral', logo: '' }, bus_type: 'Executivo', price: 150.00, total_seats: 46, occupied_seats: [], departure: { time: '08:00', city: pedido.origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } }, arrival: { time: '14:15', city: pedido.destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } } },
                { id: 'demo-2', company: { name: 'Nacional', logo: '' }, bus_type: 'Convencional', price: 180.00, total_seats: 46, occupied_seats: [], departure: { time: '14:00', city: pedido.origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } }, arrival: { time: '19:45', city: pedido.destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } } }
            ];
        }

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
