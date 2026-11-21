const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// CONFIGURAÇÕES DO PROXY GTI (Mude aqui ou use variáveis de ambiente no Render)
// ==========================================
const PROXY_HOST = process.env.PROXY_HOST || 'IP_DO_PROXY_AQUI';
const PROXY_PORT = process.env.PROXY_PORT || 'PORTA_AQUI';
const PROXY_USER = process.env.PROXY_USER || 'msantanamiranda7@gmail.com';
const PROXY_PASS = process.env.PROXY_PASS || 'x2dgvd';

// Monta a URL do proxy para o Axios
const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
const httpsAgent = new HttpsProxyAgent(proxyUrl);

// ==========================================
// MEMÓRIA PARA GUARDAR OS PEDIDOS (Fila de busca)
// ==========================================
const pedidos = {};

// Rota 1: O frontend chama isso quando clica em "Buscar"
app.get('/api/clickbus/search', async (req, res) => {
    const { origem, destino, data } = req.query;

    if (!origem || !destino || !data) {
        return res.status(400).json({ error: 'Faltando parâmetros: origem, destino, data' });
    }

    // Cria um ID único para esse pedido
    const pedidoId = Date.now().toString() + Math.floor(Math.random() * 1000);
    
    // Salva na memória como "processando"
    pedidos[pedidoId] = {
        status: 'processando',
        data: null,
        error: null
    };

    // Responde rápido para o frontend (Ele vai começar a fazer polling)
    res.json({ pedidoId });

    // Inicia a busca em background (não trava a resposta)
    buscarViagensGeckoAPI(origem, destino, data, pedidoId);
});

// Rota 2: O frontend fica perguntando "já acabou?" aqui a cada 1 segundo
app.get('/api/clickbus/resultado/:pedidoId', (req, res) => {
    const { pedidoId } = req.params;
    const pedido = pedidos[pedidoId];

    if (!pedido) {
        return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    res.json(pedido);
});


// ==========================================
// FUNÇÃO QUE FAZ O SCRAPING NA GECKOAPI
// ==========================================
async function buscarViagensGeckoAPI(origem, destino, data, pedidoId) {
    console.log(`[${pedidoId}] Buscando viagens REAIS para: ${origem} -> ${destino} em ${data}`);

    try {
        // ATENÇÃO: Substitua pela URL real da GeckoAPI que você estava usando
        // Exemplo: const apiUrl = `https://api.gecko.com/search?origem=${origem}...`
        const apiUrl = `https://sua-api-da-gecko-aqui.com/search?origem=${encodeURIComponent(origem)}&destino=${encodeURIComponent(destino)}&data=${data}`;

        const response = await axios.get(apiUrl, {
            httpsAgent: httpsAgent, // Usa o Proxy GTI
            proxy: false, // Desativa o proxy padrão do axios para usar o httpsAgent
            timeout: 30000, // 30 segundos de timeout (proxy móvel pode ser lento)
            headers: {
                // Headers cruciais para simular um celular real
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                'Referer': 'https://www.buser.com.br/',
                'Origin': 'https://www.buser.com.br'
            }
        });

        console.log(`[${pedidoId}] Sucesso! Viagens encontradas:`, response.data.length || 'desconhecido');

        // Atualiza o pedido para concluído com os dados
        pedidos[pedidoId] = {
            status: 'concluido',
            data: response.data, // Aqui vão os dados reais
            error: null
        };

    } catch (error) {
        console.error(`[${pedidoId}] Erro na GeckoAPI:`, error.message);
        
        // Se o proxy falhar, registra o erro no pedido
        pedidos[pedidoId] = {
            status: 'erro',
            data: null,
            message: 'Erro ao conectar com a operadora. Tente novamente.'
        };
    }
}

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR (Render usa a porta 10000)
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Usando Proxy: ${PROXY_HOST}:${PROXY_PORT}`);
});
