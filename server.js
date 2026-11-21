const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json());

// =========================================================
// 1. CONFIGURAÇÕES DO PROXY GTI (JÁ PREENCHIDO PELA SUA IMAGEM)
// =========================================================
const PROXY_HOST = 'srv.gtiproxy.com';
const PROXY_PORT = '8049';
const PROXY_USER = 'gt1efa37d76ab';
const PROXY_PASS = 'aa3cba69e2f6'; // A senha que estava escondida na sua imagem

const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
const httpsAgent = new HttpsProxyAgent(proxyUrl);

// =========================================================
// 2. AQUI VOCÊ COLOCA O LINK DA SUA API
// =========================================================
// ⚠️ ATENÇÃO: TROQUE ESSE LINK ABAIXO PELO LINK REAL DA GECKOAPI ⚠️
const URL_API_BUSCA = 'https://sua-api-da-gecko-aqui.com/search'; 
// =========================================================


const pedidos = {};

app.get('/api/clickbus/search', async (req, res) => {
    const { origem, destino, data } = req.query;

    if (!origem || !destino || !data) {
        return res.status(400).json({ error: 'Faltando parâmetros' });
    }

    const pedidoId = Date.now().toString() + Math.floor(Math.random() * 1000);
    pedidos[pedidoId] = { status: 'processando', data: null };

    res.json({ pedidoId });

    buscarViagens(origem, destino, data, pedidoId);
});

app.get('/api/clickbus/resultado/:pedidoId', (req, res) => {
    const pedido = pedidos[req.params.pedidoId];
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json(pedido);
});

async function buscarViagens(origem, destino, data, pedidoId) {
    console.log(`[${pedidoId}] Buscando viagens com Proxy: ${origem} -> ${destino}`);

    try {
        // Monta a URL final com os dados que o HTML mandou
        const urlFinal = `${URL_API_BUSCA}?origem=${encodeURIComponent(origem)}&destino=${encodeURIComponent(destino)}&data=${data}`;
        
        const response = await axios.get(urlFinal, {
            httpsAgent: httpsAgent, // Usa o Proxy GTI
            proxy: false, 
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                'Referer': 'https://www.buser.com.br/',
                'Origin': 'https://www.buser.com.br'
            }
        });

        console.log(`[${pedidoId}] Sucesso! Dados recebidos.`);
        
        pedidos[pedidoId] = {
            status: 'concluido',
            data: response.data.viagens || response.data.data || response.data // Adapta ao formato da API
        };

    } catch (error) {
        console.error(`[${pedidoId}] Erro no Proxy/API:`, error.message);
        pedidos[pedidoId] = {
            status: 'erro',
            data: [],
            message: 'Erro ao conectar com a operadora.'
        };
    }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Usando Proxy: ${PROXY_HOST}:${PROXY_PORT}`);
});
