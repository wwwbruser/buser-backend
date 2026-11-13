const admin = require('firebase-admin');
const axios = require('axios');

// ============================================================
// 🔒 FIREBASE (Cole aqui o JSON da sua conta de serviço NOVA)
// ============================================================
const serviceAccount = {
  "type": "service_account",
  "project_id": "projeto-link-ddbf0",
  "private_key_id": "SUA_CHAVE_AQUI",
  "private_key": "-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_AQUI\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@projeto-link-ddbf0.iam.gserviceaccount.com",
  // ... (copie o resto do seu JSON novo)
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com"
});
const db = admin.database();

console.log('🤖 Robô do PC iniciado. Aguardando pedidos na fila...');

// ============================================================
// FUNÇÃO QUE FAZ A BUSCA REAL NA CLICKBUS (A partir do seu IP)
// ============================================================
async function buscarClickBusReal(origem, destino, data) {
    const criarSlug = (cidadeString) => {
        const [cidade, uf] = cidadeString.split(',').map(s => s.trim());
        return `${cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '-')}-${uf.toLowerCase()}`;
    };

    try {
        const response = await axios.get('https://api.clickbus.com/api/v5/trips', {
            params: {
                from: `${criarSlug(origem)}-todos`,
                to: `${criarSlug(destino)}-todos`,
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

        // Formata os dados reais
        return viagens.map(trip => {
            // Lógica das poltronas aleatórias (35%)
            const totalAssentos = 46;
            const qtdOcupadas = Math.floor(totalAssentos * 0.35);
            const ocupadas = [];
            const seed = (trip.id || "1").toString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            for (let i = 1; i <= totalAssentos; i++) {
                if ((i * seed) % 10 < 3.5) ocupadas.push(i);
            }

            return {
                id: trip.id || Math.random().toString(),
                company: { 
                    name: trip.travelCompany?.name || trip.company?.name || "Viação Parceira", 
                    logo: trip.travelCompany?.logo || trip.company?.logo || "" 
                },
                price: Number(trip.price || 0),
                bus_type: trip.bus_type || "Convencional",
                total_seats: totalAssentos,
                occupied_seats: ocupadas.slice(0, qtdOcupadas),
                departure: { 
                    time: trip.departure?.time || "--:--", 
                    city: origem.split(',')[0].trim(), 
                    terminal: { name: trip.departure?.place?.name || "Terminal Principal", address: "" } 
                },
                arrival: { 
                    time: trip.arrival?.time || "--:--", 
                    city: destino.split(',')[0].trim(), 
                    terminal: { name: trip.arrival?.place?.name || "Terminal Principal", address: "" } 
                }
            };
        });
    } catch (error) {
        console.log('⚠️ ClickBus bloqueou ou deu erro. Retornando null.');
        return null;
    }
}

// ============================================================
// ESCUTANDO A FILA EM TEMPO REAL
// ============================================================
db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();
    if (pedido.status !== 'processando') return;

    console.log(`\n⚙️ PC processando pedido ${pedidoId} (${pedido.origem} -> ${pedido.destino})`);

    try {
        // Tenta buscar os dados REAIS na ClickBus
        let resultado = await buscarClickBusReal(pedido.origem, pedido.destino, pedido.data);

        // Se falhar (ex: rota não existe), avisa no log
        if (!resultado || resultado.length === 0) {
            console.log('⚠️ Nenhuma viagem real encontrada. O Render vai usar o Gerador Matemático.');
            // Atualiza para erro para o Render (que está escutando) gerar os dados fake
            await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro_pc' });
            return;
        }

        // Salva os dados REAIS no Firebase
        await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'concluido', resultado, concluidoEm: Date.now() });
        console.log(`✅ PC concluiu o pedido com ${resultado.length} viagens REAIS.`);

    } catch (error) {
        console.error(`❌ Falha no PC para o pedido ${pedidoId}:`, error.message);
        await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro_pc' });
    }
});
