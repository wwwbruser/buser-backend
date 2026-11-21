const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// ============================================================
// 1. SERVIDOR EXPRESS (Mantém o Render acordado)
// ============================================================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.send('Robô Buser Online está rodando!');
});

app.listen(PORT, () => {
    console.log(`\n✅ Servidor web rodando na porta ${PORT}`);
});

// ============================================================
// 2. FIREBASE (Lendo da variável FIREBASE_CREDENTIALS)
// ============================================================
let db; 

try {
    // Pega o JSON do Render. 
    // DICA: No Render, cole o JSON puro na variável FIREBASE_CREDENTIALS.
    const serviceAccountString = process.env.FIREBASE_CREDENTIALS;
    
    if (!serviceAccountString) {
        throw new Error("A variável FIREBASE_CREDENTIALS não está configurada no Render.");
    }

    const serviceAccount = JSON.parse(serviceAccountString);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com"
    });

    db = admin.database();
    console.log('✅ Firebase inicializado com sucesso.');

} catch (e) {
    console.error('❌ ERRO FATAL no Firebase:', e.message);
    console.error('Verifique se o JSON está perfeitamente colado no Render.');
    process.exit(1); // Para o app se o Firebase falhar
}

// ============================================================
// 3. CONFIGURAÇÃO DO PROXY GTI 
// ============================================================
const PROXY_HOST = 'srv.gtiproxy.com';
const PROXY_PORT = '8049';
const PROXY_USER = 'gt1efa37d76ab';
const PROXY_PASS = 'aa3cba69e2f6';

const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
const httpsAgent = new HttpsProxyAgent(proxyUrl);

console.log(`✅ Proxy configurado para: ${PROXY_HOST}:${PROXY_PORT}`);
console.log('🤖 Robô de busca de viagens iniciado. Aguardando pedidos na fila...');

// ============================================================
// 4. FUNÇÃO QUE FAZ A BUSCA REAL NA CLICKBUS
// ============================================================
async function buscarClickBusReal(origem, destino, data) {
    const criarSlug = (cidadeString) => {
        const [cidade, uf] = cidadeString.split(',').map(s => s.trim());
        return `${cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, '-')}-${uf.toLowerCase()}`;
    };

    try {
        console.log(`\nTentando buscar: ${origem} -> ${destino} em ${data}`);
        
        const response = await axios.get('https://api.clickbus.com/api/v5/trips', {
            params: {
                from: `${criarSlug(origem)}-todos`,
                to: `${criarSlug(destino)}-todos`,
                departureDate: data,
                clientId: 'buser-online-clone'
            },
            httpsAgent: httpsAgent, // Usa o proxy
            proxy: false,           // Desativa o proxy padrão
            timeout: 30000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
            }
        });

        let viagens = response.data.data || response.data.trips || [];
        if (!Array.isArray(viagens)) viagens = [];

        // Formata os dados reais
        return viagens.map(trip => {
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
        console.log('⚠️ Erro na busca real (Proxy/API):', error.message);
        return null;
    }
}

// ============================================================
// 5. ESCUTANDO A FILA EM TEMPO REAL (Firebase)
// ============================================================
db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();
    
    // Ignora pedidos que já foram processados
    if (pedido.status !== 'processando') return;

    console.log(`\n⚙️ Processando pedido ${pedidoId} (${pedido.origem} -> ${pedido.destino})`);

    try {
        let resultado = await buscarClickBusReal(pedido.origem, pedido.destino, pedido.data);

        if (!resultado || resultado.length === 0) {
            console.log('⚠️ Nenhuma viagem real encontrada. O Render vai usar o Gerador Matemático.');
            await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro_pc' });
            return;
        }

        // Salva os dados REAIS no Firebase
        await db.ref(`fila_pedidos/${pedidoId}`).update({ 
            status: 'concluido', 
            resultado, 
            concluidoEm: Date.now() 
        });
        console.log(`✅ Concluído com ${resultado.length} viagens REAIS.`);

    } catch (error) {
        console.error(`❌ Falha no pedido ${pedidoId}:`, error.message);
        await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro_pc' });
    }
});
