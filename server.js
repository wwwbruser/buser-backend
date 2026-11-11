const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const GEKKO_API_KEY = "pk_live_hMefqko4aIEWJGgZpRMxXgnnpsUS9OPh"; 

app.get('/api/clickbus/search', async (req, res) => {
    const { origem, destino, data } = req.query;
    if (!origem || !destino || !data) return res.status(400).json({ error: 'Faltando parâmetros.' });

    try {
        const origemCidade = origem.split(',')[0].trim();
        const destinoCidade = destino.split(',')[0].trim();

        const payload = {
            target: 'clickbus.com.br',
            type: 'plp',
            originCity: origemCidade,
            originState: origem.split(',')[1]?.trim(),
            destinationCity: destinoCidade,
            destinationState: destino.split(',')[1]?.trim(),
            departureDate: data,
            page: 1
        };

        console.log('Buscando...');
        const response = await axios.post('https://api.geckoapi.com.br/v1/extract', payload, {
            headers: { 'Authorization': `Bearer ${GEKKO_API_KEY}`, 'Content-Type': 'application/json' }
        });

        const json = response.data;
        let viagens = json.data?.items || json.data || [];

        console.log(`✅ Encontradas ${viagens.length} viagens.`);
        if (viagens.length > 0) {
            console.log('Amostra do primeiro item:', JSON.stringify(viagens[0]).substring(0, 500));
        }

        const formatadas = viagens.map(trip => {
            // 🔥 AQUI ESTÁ A MÁGICA PARA PEGAR O NOME DA EMPRESA
            const nomeEmpresa = 
                trip.company?.name || 
                trip.busCompany?.name || 
                trip.empresa?.nome || 
                trip.empresa || 
                trip.operator?.name ||
                "Viação (Gekko)"; 

            return {
                id: trip.id || Math.random().toString(),
                company: { name: nomeEmpresa, logo: trip.company?.logo || "" },
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
            };
        });

        res.json({ data: formatadas });

    } catch (error) {
        console.error('Erro:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erro', data: [] });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
