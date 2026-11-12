const axios = require('axios');
const admin = require('firebase-admin');

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
    console.log("✅ Worker: Firebase Admin inicializado com sucesso.");
  } catch (error) {
    console.error("❌ Worker: ERRO CRÍTICO ao inicializar Firebase.", error.message);
    process.exit(1); // Para o worker se não conseguir conectar
  }
}
const db = admin.database();

console.log('Worker iniciado. Aguardando pedidos na fila...');

// ============================================================
// FUNÇÃO PARA BUSCAR NA CLICKBUS
// ============================================================
async function buscarNaClickBus(origem, destino, data) {
    const criarSlug = (cidadeString) => {
        const [cidade, uf] = cidadeString.split(',').map(s => s.trim());
        const cidadeSlug = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '-');
        return `${cidadeSlug}-${uf.toLowerCase()}`;
    };

    const origemSlug = criarSlug(origem);
    const destinoSlug = criarSlug(destino);

    try {
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
            timeout: 60000
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
            occupied_seats: [],
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
        return null;
    }
}

// ============================================================
// ESCUTANDO A FILA EM TEMPO REAL
// ============================================================
db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();

    // Só processa se estiver pendente
    if (pedido.status !== 'processando') return;

    console.log(`\n⚙️ Processando pedido ${pedidoId} (${pedido.origem} -> ${pedido.destino})`);

    try {
        // 1. Tenta buscar na ClickBus
        let resultado = await buscarNaClickBus(pedido.origem, pedido.destino, pedido.data);

        // 2. Se falhou (bloqueio ou nenhuma viagem), usa o Modo Demonstração
        if (!resultado || resultado.length === 0) {
            console.log('⚠️ ClickBus bloqueou ou não retornou viagens. Ativando Modo Demonstração.');
            
            resultado = [
                { id: 'demo-1', company: { name: 'Catedral', logo: '' }, bus_type: 'Executivo', price: 150.00, total_seats: 46, occupied_seats: [], departure: { time: '08:00', city: pedido.origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } }, arrival: { time: '14:15', city: pedido.destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } } },
                { id: 'demo-2', company: { name: 'Nacional', logo: '' }, bus_type: 'Convencional', price: 180.00, total_seats: 46, occupied_seats: [], departure: { time: '14:00', city: pedido.origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } }, arrival: { time: '19:45', city: pedido.destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } } }
            ];
        }

        // 3. Atualiza o pedido no Firebase com o resultado
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
