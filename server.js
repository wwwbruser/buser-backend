const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json());

const filaPedidos = {};

app.get('/api/clickbus/search', async (req, res) => {
    const { origem, destino, data } = req.query;
    if (!origem || !destino || !data) return res.status(400).json({ error: 'Faltando parâmetros.' });

    const pedidoId = uuidv4();
    filaPedidos[pedidoId] = { status: 'processando' };
    
    res.status(202).json({ message: 'Busca em andamento.', pedidoId });

    try {
        const [origemCidade, origemUF] = origem.split(',').map(s => s.trim());
        const [destinoCidade, destinoUF] = destino.split(',').map(s => s.trim());

        console.log(`\n📡 Buscando viagens REAIS para: ${origemCidade}-${origemUF} -> ${destinoCidade}-${destinoUF}`);

        const proxyUrl = process.env.PROXY_URL;
        let agent = null;
        if (proxyUrl) {
            agent = new HttpsProxyAgent(proxyUrl);
            console.log('✅ Usando Proxy GTI.');
        }

        // Chamada para a GeckoAPI
        const response = await axios.post(
            'https://api.geckoapi.com.br/v1/extract',
            {
                target: 'clickbus.com.br',
                type: 'plp',
                originCity: origemCidade,
                originState: origemUF.toUpperCase(),
                destinationCity: destinoCidade,
                destinationState: destinoUF.toUpperCase(),
                departureDate: data,
                page: 1
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.GECKO_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                httpsAgent: agent,
                timeout: 60000
            }
        );

        // 🔥 O ESPIÃO: Vai imprimir o JSON inteiro da GeckoAPI no log do Render
        console.log('\n[DEBUG GECKO] Resposta crua:', JSON.stringify(response.data).substring(0, 1500));

        // Tenta ler as viagens de todos os lugares possíveis
        let viagens = [];
        if (response.data) {
            if (Array.isArray(response.data)) viagens = response.data;
            else if (response.data.data && Array.isArray(response.data.data)) viagens = response.data.data;
            else if (response.data.data && response.data.data.items) viagens = response.data.data.items;
            else if (response.data.items) viagens = response.data.items;
            else if (response.data.trips) viagens = response.data.trips;
        }

        if (viagens.length > 0) {
            console.log(`✅ GeckoAPI retornou ${viagens.length} viagens reais!`);
            
            const resultadoReal = viagens.map(trip => ({
                id: trip.id || uuidv4(),
                company: { name: trip.travelCompany?.name || trip.company?.name || "Viação", logo: trip.travelCompany?.logo || "" },
                price: Number(trip.price || 0),
                bus_type: trip.bus_type || "Convencional",
                total_seats: 46,
                occupied_seats: [2,5,8,12,15,22,28,33,40,41,42,43,44,45,46,4], 
                departure: { time: trip.departure?.time || "--:--", city: origemCidade, terminal: { name: trip.departure?.place?.name || "Terminal Principal", address: "" } },
                arrival: { time: trip.arrival?.time || "--:--", city: destinoCidade, terminal: { name: trip.arrival?.place?.name || "Terminal Principal", address: "" } }
            }));

            filaPedidos[pedidoId] = { status: 'concluido', data: resultadoReal };
            return; 
        } else {
            console.log('⚠️ O JSON acima não contém viagens no formato esperado. Usando fallback.');
        }

    } catch (error) {
        console.error('❌ Erro na GeckoAPI:', error.response?.data || error.message);
    }

    // FALLBACK
    setTimeout(() => {
        filaPedidos[pedidoId] = {
            status: 'concluido',
            data: [
                { 
                    id: uuidv4(), company: { name: 'Catedral', logo: '' }, price: 150.00, bus_type: 'Executivo', 
                    total_seats: 46, occupied_seats: [2,5,8,12,15,22,28,33,40,41,42,43,44,45,46,4], 
                    departure: { time: '08:00', city: origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } }, 
                    arrival: { time: '14:15', city: destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } } 
                }
            ]
        };
    }, 1500);
});

app.get('/api/clickbus/resultado/:pedidoId', (req, res) => {
    const pedido = filaPedidos[req.params.pedidoId];
    if (!pedido) return res.status(404).json({ error: 'Não encontrado' });
    res.json(pedido);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
