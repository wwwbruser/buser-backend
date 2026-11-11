const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const GEKKO_API_KEY = "pk_live_hMefqko4aIEWJGgZpRMxXgnnpsUS9OPh"; 

// Dicionário com os IDs oficiais da GekkoAPI para as principais cidades
const CIDADES_IDS = {
    "sao paulo": 1, "rio de janeiro": 4, "salvador": 2, "belo horizonte": 3, 
    "brasilia": 5, "curitiba": 6, "porto alegre": 7, "recife": 8,
    "fortaleza": 9, "florianopolis": 10, "goiania": 11, "campinas": 12,
    "santos": 13, "guarulhos": 14, "osasco": 15, "angra dos reis": 16
};

app.get('/api/clickbus/search', async (req, res) => {
    const { origem, destino, data } = req.query;

    if (!origem || !destino || !data) {
        return res.status(400).json({ error: 'Faltando parâmetros.' });
    }

    try {
        // Pega a cidade limpa (sem UF)
        const origemCidade = origem.split(',')[0].trim();
        const destinoCidade = destino.split(',')[0].trim();
        
        // Converte para minúsculo para achar no dicionário
        const origemId = CIDADES_IDS[origemCidade.toLowerCase()] || 1;
        const destinoId = CIDADES_IDS[destinoCidade.toLowerCase()] || 4;

        console.log(`\n--- BUSCA ---`);
        console.log(`Origem ID: ${origemId} | Destino ID: ${destinoId} | Data: ${data}`);

        // A GekkoAPI para ClickBus geralmente usa este endpoint exato:
        const response = await axios.post(
            'https://api.geckoapi.com.br/v1/extract',
            {
                target: 'clickbus.com.br',
                type: 'plp',
                originId: origemId,       // <-- MUDANÇA AQUI (ID em vez de nome)
                destinationId: destinoId, // <-- MUDANÇA AQUI (ID em vez de nome)
                departureDate: data, 
                page: 1
            },
            {
                headers: {
                    'Authorization': `Bearer ${GEKKO_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const json = response.data;

        if (json.notFound || !json.data) {
            console.log('⚠️ GekkoAPI: Nenhuma viagem encontrada para estes IDs.');
            return res.json({ data: [] });
        }

        // A GekkoAPI retorna os itens dentro de "data.items"
        let viagens = [];
        if (Array.isArray(json.data)) viagens = json.data;
        else if (json.data.items) viagens = json.data.items;

        console.log(`✅ Encontradas ${viagens.length} viagens.`);

        const formatadas = viagens.map(trip => ({
            id: trip.id || Math.random().toString(),
            company: { name: trip.company?.name || "Viação", logo: trip.company?.logo || "" },
            price: Number(trip.price || 0),
            bus_type: trip.bus_type || "Convencional",
            total_seats: 46,
            occupied_seats: [],
            departure: {
                time: trip.departure?.time || "--:--",
                city: origemCidade,
                terminal: { name: trip.departure?.terminal?.name || "Terminal Principal" }
            },
            arrival: {
                time: trip.arrival?.time || "--:--",
                city: destinoCidade,
                terminal: { name: trip.arrival?.terminal?.name || "Terminal Principal" }
            }
        }));

        res.json({ data: formatadas });

    } catch (error) {
        console.error('❌ Erro Gekko:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erro na API', data: [] });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
