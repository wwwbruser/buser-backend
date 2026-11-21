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
// 2. FIREBASE (JÁ COM A SUA CHAVE REAL COLADA AQUI)
// ============================================================
const serviceAccount = {
  "type": "service_account",
  "project_id": "projeto-link-ddbf0",
  "private_key_id": "d61922cc005ce77e5faf8bccf89a2e7b7c6cc995",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCzXPX9Vn98raKq\nlJo+Rd7+6fVM1OEd9IiyIdlrZMABJ3ihayHBglT6IfjeDvMAarod6PqCrlYvdY2c\nhLwt6do0jovquFPSeZLwXu2hNKEyGmxFE7ZW1a//laXRxDlXhkyGTlPiARKbhdZl\njOf90AnJIRPk+MYeeezYTajN3dLq0Siiwj7ZQeNWwKyBpdQ1RIs5dU3ujYsy8Ihq\nY62U6wXt3w5vC9MxCki2jB89UqjZL2XZ+p0G/A6WizH7al4Y+GMgTkk8wEneT9Yk\nloivSrG/FXsu2bHdSEiZY3L103n8+VY44zmlm7k45i8t6GCPg8tOMhzkR6ymAqoA\n5tGS7/fXAgMBAAECggEAFMNNnIp/To0BGBMEufG3qzWlFkRMXP3aNxixBPwQN/H8\nRl9S9IYkVSJKn1YGrkUsj1rRaQBKbMsEXhqFeCEqh8v6iWzWEzbMmjO6+V7QzC5/\n2w05ndq1uXX20I4Q/z9GK4P0tORf5Y38MBw8HMcQ4u4H0gk0UgHWN4Hh6RblHBZx\nq3DJ1tBI3nSaHLqZ1poEgZDkxofvK87uNIc2imZhfDkp6ClNa7rqB+R8Vw4Mw3bj\nzt9+FF5Uy5+S3plY26Yxb0eyX1JmUYBIEhty4PC+yAJbLxQsyB+1iRg8MEFEIDWP\nfLOgNB1nh/fGEu1vVWlOV9bjlUpGfL1hSo2YPRSOQQKBgQDYDGQrMAjm+30b1QXX\nZEFmbmT9Vvn+eFEQmK3pA/Qi3IOtAWgkK5JopS74C+IOZfomWvPdjfpL2vaQlvHS\nw3vYLnXDrvWHyyShQPnAmDopGMeuHrosBXchZFOlSvWpbw8z18uRZq3Aa3Q7MaSd\np+0NDEMkBSmmQS9SadGdGOJjwQKBgQDUh+jXFjqZbWtUkJferRRiIyOsJHwf3LfM\nEBa/B0Yn5wDF7JyPlmv9D4Hkg2h6I7fuEAxveFFxJBLiaV+TNpvfEd1TOU3quRou\nJN96NlusrgbUn7WSJkoR54rTM6qyQMCWr78ICY8/Q73o5MdJiDkg2mG4xLvwMI9y\np71KqFthlwKBgFDwE3a6gBtIjA4pOA8BWB7vrJXcR7u1h2kYSc7J1GRbCFl/9WvX\nhvn9KCN1EDMksRo9aK7Pyb0xQr3YTrAO3A6ZGTU+Dm3ZBNgEZ4xneyJ6ThRFHqnv\nQjoYQ93gvzfCi4d4iKLoPJ+hoeGrL2iAyKXiuiR8aqYGNZxCWGzqLaYBAoGAYgK3\nRxGSPpUuTRZNYzxwTP2lgspkj5ELFclJpBjnqpkmSyBd5v3YmSBgp5BOSx1Twi6W\nfYWAEWwwZUdw8wPZCBtF9Q5VN2zbfPI2OTb+OfkbX0yzwE12FSGxbMrD6mZgKl2r\n/DnkXKmR1+hBW1C9/7+WF05q2U6bqKVgbyCK28sCgYEA0BdgTHMFwBx5K+SqUOkm\nBIcI1clVms5YE51kj0ojqqnbH6pDReadQKDpegFm0+g5St/2mv0HaIAmADlA7pM+\nrfLJHKr7Tjga2rNG8eHmeDkTW7L3Ts4EJXZ1RUomnC9XG6m3n06cSSGF2Q+uzOIN\nsbGU+TjbYLahGQ+7rvstHkI=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@projeto-link-ddbf0.iam.gserviceaccount.com",
  "client_id": "111553288974699411914",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40projeto-link-ddbf0.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com"
    });
    console.log('✅ Firebase inicializado com sucesso.');
} catch (e) {
    console.error('❌ ERRO no Firebase:', e.message);
}

const db = admin.database();

// ============================================================
// 3. CONFIGURAÇÃO DO PROXY GTI 
// ============================================================
// Vou deixar os dados fixos aqui para você não ter dor de cabeça
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
