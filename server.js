const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json());

// 🔒 FIREBASE
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com"
    });
  } catch (error) {
    console.error("❌ ERRO CRÍTICO no Firebase:", error.message);
  }
}
const db = admin.database();

// ... (Funções de cálculo matemático: calcularDistanciaHaversine, hashDistance, calcularPrecoBase) ...

// ============================================================
// WORKER DO RENDER (TENTA API, SE FALHAR USA FALLBACK)
// ============================================================
db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();
    if (pedido.status !== 'processando') return;

    // ⏳ Espera 2 segundos para ver se o pc-worker do usuário resolve primeiro
    setTimeout(async () => {
        const snapAtual = await db.ref(`fila_pedidos/${pedidoId}`).once('value');
        const pedidoAtual = snapAtual.val();
        if (pedidoAtual.status !== 'processando' && pedidoAtual.status !== 'erro_pc') return;

        console.log(`\n⏳ PC não respondeu. Tentando GeckoAPI no Render...`);

        try {
            // 1. Formata a rota corretamente
            const origemParts = pedido.origem.split(',').map(s => s.trim());
            const destinoParts = pedido.destino.split(',').map(s => s.trim());
            const origemCidade = origemParts[0], origemUF = origemParts[1].toUpperCase();
            const destinoCidade = destinoParts[0], destinoUF = destinoParts[1].toUpperCase();

            // 2. Configura o Proxy (se existir a variável)
            const proxyUrl = process.env.PROXY_URL;
            let agent = null;
            if (proxyUrl) {
                agent = new HttpsProxyAgent(proxyUrl);
                console.log('✅ Usando proxy GTI para acessar a GeckoAPI.');
            }

            // 3. Tenta a GeckoAPI
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
                    headers: { 'Authorization': `Bearer ${process.env.GECKO_API_KEY}`, 'Content-Type': 'application/json' },
                    httpsAgent: agent,
                    timeout: 60000
                }
            );

            let viagens = response.data.data || response.data.trips || [];
            if (Array.isArray(viagens) && viagens.length > 0) {
                // Formata as viagens reais e salva
                const resultado = viagens.map(trip => ({
                    id: trip.id || Math.random().toString(),
                    company: { name: trip.travelCompany?.name || "Viação Parceira", logo: trip.travelCompany?.logo || "" },
                    price: Number(trip.price || 0),
                    bus_type: trip.bus_type || "Convencional",
                    total_seats: 46,
                    occupied_seats: [], // O frontend já calcula os 35%
                    departure: { time: trip.departure?.time || "--:--", city: origemCidade, terminal: { name: trip.departure?.place?.name || "Terminal", address: "" } },
                    arrival: { time: trip.arrival?.time || "--:--", city: destinoCidade, terminal: { name: trip.arrival?.place?.name || "Terminal", address: "" } }
                }));
                await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'concluido', resultado, concluidoEm: Date.now() });
                console.log(`✅ GeckoAPI retornou ${resultado.length} viagens reais.`);
                return;
            }
        } catch (e) {
            console.error('❌ Erro na GeckoAPI (IP bloqueado ou rota inválida):', e.response?.data || e.message);
        }

        // 4. Se a GeckoAPI falhou, usa o Fallback Matemático
        console.log(`⚠️ GeckoAPI falhou. Usando Fallback Matemático para: ${pedido.origem} -> ${pedido.destino}`);
        try {
            // ... (Lógica do Fallback Matemático para gerar viagens) ...
            // await db.ref(...).update({ status: 'concluido', ... });
        } catch (error) {
             await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro', erro: 'Erro no fallback.' });
        }

    }, 2000); // 2 segundos (para não travar muito o usuário)
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
