const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ⚠️ COLOQUE O SEU TOKEN DA GEKKOAPI AQUI
const GEKKO_API_KEY = "pk_live_hMefqko4aIEWJGgZpRMxXgnnpsUS9OPh"; 

// Função para buscar o ID da cidade na GekkoAPI
async function getCityId(cityName) {
    try {
        const response = await axios.get('https://api.geckoapi.com.br/v1/cities', {
            headers: { 'Authorization': `Bearer ${GEKKO_API_KEY}` }
        });
        
        // A API retorna uma lista de cidades. Vamos filtrar pelo nome.
        const cities = response.data.data || response.data;
        const city = cities.find(c => 
            c.name.toLowerCase().includes(cityName.toLowerCase()) || 
            cityName.toLowerCase().includes(c.name.toLowerCase())
        );
        
        return city ? city.id : null;
    } catch (error) {
        console.error('Erro ao buscar ID da cidade:', error.message);
        return null;
    }
}

app.get('/api/clickbus/search', async (req, res) => {
    const { origem, destino, data } = req.query;

    if (!origem || !destino || !data) {
        return res.status(400).json({ error: 'Faltando parâmetros.' });
    }

    try {
        // Pega apenas o nome da cidade (ex: "São Paulo")
        const origemCidade = origem.split(',')[0].trim();
        const destinoCidade = destino.split(',')[0].trim();

        console.log(`\n--- BUSCA ---`);
        console.log(`Origem: ${origemCidade} | Destino: ${destinoCidade} | Data: ${data}`);

        // 1. Busca os IDs das cidades
        const origemId = await getCityId(origemCidade);
        const destinoId = await getCityId(destinoCidade);

        if (!origemId || !destinoId) {
            console.log('❌ Cidade não encontrada na GekkoAPI.');
            return res.status(400).json({ error: 'Cidade não encontrada na base da GekkoAPI.' });
        }

        console.log(`IDs encontrados -> Origem: ${origemId} | Destino: ${destinoId}`);

        // 2. Faz a extração da ClickBus usando os IDs
        const response = await axios.post(
            'https://api.geckoapi.com.br/v1/extract',
            {
                target: 'clickbus.com.br',
                type: 'plp',
                originId: origemId,       // <-- Agora envia o ID
                destinationId: destinoId, // <-- Agora envia o ID
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
            console.log('⚠️ GekkoAPI: Nenhuma viagem encontrada.');
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
