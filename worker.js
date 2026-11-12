const axios = require('axios');
const admin = require('firebase-admin');

// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCmoxq5NMQUj1hqyWhjaJz4Uw4grhsFFhA",
  authDomain: "projeto-link-ddbf0.firebaseapp.com",
  databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com",
  projectId: "projeto-link-ddbf0",
  storageBucket: "projeto-link-ddbf0.firebasestorage.app",
  messagingSenderId: "560317126646",
  appId: "1:560317126646:web:be9cad9c9ed350940399d7"
};

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

console.log('Worker iniciado. Aguardando pedidos na fila...');

// --- FUNÇÃO PARA BUSCAR NA CLICKBUS ---
async function buscarNaClickBus(origem, destino, data) {
    const criarSlug = (cidadeString) => {
        const [cidade, uf] = cidadeString.split(',').map(s => s.trim());
        const cidadeSlug = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '-');
        return `${cidadeSlug}-${uf.toLowerCase()}`;
    };

    const origemSlug = criarSlug(origem);
    const destinoSlug = criarSlug(destino);

    try {
        // Tentativa direta na ClickBus (pode ser bloqueada)
        const response = await axios.get('https://api.clickbus.com/api/v5/trips', {
            params: {
                from: `${origemSlug}-todos`,
                to: `${destinoSlug}-todos`,
                departureDate: data,
                clientId: 'buser-online-clone'
            },
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 30000
        });

        let viagens = response.data.data || response.data.trips || [];
        if (!Array.isArray(viagens)) viagens = [];

        return viagens.map(trip => ({
            id: trip.id || Math.random().toString(),
            company: { 
                name: trip.company?.name || trip.travelCompany?.name || "Viação Parceira", 
                logo: trip.company?.logo || "" 
            },
            price: Number(trip.price || trip.fare || 0),
            bus_type: trip.bus_type || trip.serviceClass || "Convencional",
            total_seats: 46,
            occupied_seats: [], // O frontend já calcula os 35% se estiver vazio
            departure: {
                time: trip.departure?.time || "--:--",
                city: origem.split(',')[0].trim(),
                terminal: { name: trip.departure?.location?.name || "Terminal Principal", address: "" }
            },
            arrival: {
                time: trip.arrival?.time || "--:--",
                city: destino.split(',')[0].trim(),
                terminal: { name: trip.arrival?.location?.name || "Terminal Principal", address: "" }
            }
        }));

    } catch (error) {
        console.error(`❌ Erro na ClickBus para ${origemSlug} -> ${destinoSlug}:`, error.message);
        return null; // Retorna null para indicar erro
    }
}

// --- ESCUTANDO A FILA EM TEMPO REAL ---
db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();

    if (pedido.status !== 'processando') return; // Só processa se estiver pendente

    console.log(`\n⚙️ Processando pedido ${pedidoId} (${pedido.origem} -> ${pedido.destino})`);

    try {
        // 1. Tenta buscar na ClickBus
        let resultado = await buscarNaClickBus(pedido.origem, pedido.destino, pedido.data);

        // 2. Se falhou (bloqueio), usa o Modo Demonstração
        if (!resultado || resultado.length === 0) {
            console.log('⚠️ ClickBus bloqueou. Ativando Modo Demonstração para o usuário.');
            
            // Gera viagens falsas (igual ao botão de demonstração do frontend)
            resultado = [
                {
                    id: 'demo-1',
                    company: { name: 'Catedral', logo: '' },
                    bus_type: 'Executivo',
                    price: 150.00,
                    total_seats: 46,
                    occupied_seats: [],
                    departure: { time: '08:00', city: pedido.origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } },
                    arrival: { time: '14:15', city: pedido.destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } }
                },
                {
                    id: 'demo-2',
                    company: { name: 'Nacional', logo: '' },
                    bus_type: 'Convencional',
                    price: 180.00,
                    total_seats: 46,
                    occupied_seats: [],
                    departure: { time: '14:00', city: pedido.origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } },
                    arrival: { time: '19:45', city: pedido.destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } }
                }
            ];
        }

        // 3. Atualiza o Firebase com o resultado final
        await db.ref(`fila_pedidos/${pedidoId}`).update({
            status: 'concluido',
            resultado: resultado,
            concluidoEm: Date.now()
        });

        console.log(`✅ Pedido ${pedidoId} concluído com ${resultado.length} viagens.`);

    } catch (error) {
        console.error(`❌ Falha crítica no pedido ${pedidoId}:`, error);
        await db.ref(`fila_pedidos/${pedidoId}`).update({
            status: 'erro',
            erro: 'Erro interno ao processar a busca.'
        });
    }
});
