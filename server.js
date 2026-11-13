const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// 🔒 FIREBASE
// ============================================================
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

// ... (CÓDIGO DE COORDENADAS E FALLBACK MATEMÁTICO PERMANECE IGUAL) ...
// [Manter as funções calcularDistanciaHaversine, hashDistance, calcularPrecoBase]

// ============================================================
// WORKER (CHAMADA DA GECKOAPI COM A ROTA CORRIGIDA)
// ============================================================
db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();
    if (pedido.status !== 'processando') return;

    // ... (Lógica de esperar o PC responder) ...

    try {
        // 🔥 FORMATAÇÃO CORRETA DA ROTA
        const origemParts = pedido.origem.split(',').map(s => s.trim());
        const destinoParts = pedido.destino.split(',').map(s => s.trim());
        
        const origemCidade = origemParts[0];
        const origemUF = origemParts[1].toUpperCase(); // Garante que o estado seja maiúsculo
        const destinoCidade = destinoParts[0];
        const destinoUF = destinoParts[1].toUpperCase();

        console.log(`📡 Enviando para GeckoAPI: ${origemCidade}-${origemUF} -> ${destinoCidade}-${destinoUF} | Data: ${pedido.data}`);

        const response = await axios.post(
            'https://api.geckoapi.com.br/v1/extract',
            {
                target: 'clickbus.com.br',
                type: 'plp',
                originCity: origemCidade,     // Ex: "São Paulo"
                originState: origemUF,        // Ex: "SP"
                destinationCity: destinoCidade, // Ex: "Rio de Janeiro"
                destinationState: destinoUF,    // Ex: "RJ"
                departureDate: pedido.data,   // Ex: "2026-11-20"
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
            // ... (Código para formatar as viagens e retornar sucesso) ...
        } else {
            console.log('⚠️ GeckoAPI retornou 0 viagens. Rota existe, mas sem horários para esta data.');
            // Aqui você pode querer usar o fallback matemático
            throw new Error('Nenhuma viagem encontrada na GeckoAPI');
        }

    } catch (e) {
        console.error('❌ Erro na GeckoAPI (Pode ser IP ou Rota):', e.response?.data || e.message);
        // Se a GeckoAPI falhar (por IP ou Rota), usamos o Fallback Matemático para não deixar o cliente na mão
        // ... (Lógica do fallback)
    }
});
