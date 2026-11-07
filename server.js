const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// 👇 COLOQUE SUA CHAVE NOVA AQUI (que começa com gko_) 👇
const GECKO_API_KEY = 'pk_live_WA8AW7nKHxo5JFDsotrW2_B9BGMb3w6A';

app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;
  console.log(`\n[Buscando]: ${origem} -> ${destino} | Data: ${data}`);

  try {
    const origemParts = origem.split(',').map(s => s.trim());
    const destinoParts = destino.split(',').map(s => s.trim());

    const payload = {
      target: 'clickbus.com.br',
      type: 'plp',
      page: 1,
      originCity: origemParts[0],
      originState: origemParts[1] || 'BA',
      destinationCity: destinoParts[0],
      destinationState: destinoParts[1] || 'RJ',
      departureDate: data
    };

    const response = await axios.post('https://api.geckoapi.com.br/v1/extract', payload, {
      headers: {
        'Authorization': `Bearer ${GECKO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const rawTrips = response.data?.data?.items || [];

    const viagensFormatadas = rawTrips.map(trip => {
        return {
            company: { name: trip.travelCompany?.name || "Viação" },
            departure: { 
                time: trip.departure?.time || "--:--",
                terminal: trip.departure?.place?.terminal || "Rodoviária",
                address: trip.departure?.place?.terminalAddress || ""
            },
            arrival: { 
                time: trip.arrival?.time || "--:--",
                terminal: trip.arrival?.place?.terminal || "Rodoviária",
                address: trip.arrival?.place?.terminalAddress || ""
            },
            price: trip.discountedPrice || trip.price || 0,
            bus_type: trip.serviceClass?.name || "Convencional"
        };
    });

    console.log(`✅ SUCESSO! ${viagensFormatadas.length} viagens reais formatadas.`);
    return res.json(viagensFormatadas);

  } catch (error) {
    console.error(`❌ Erro na API: ${error.message}`);
    if (error.response) {
      console.error('Detalhes:', JSON.stringify(error.response.data));
    }
    res.json([]); 
  }
});

app.listen(3000, () => {
  console.log('✅ Servidor rodando na porta 3000');
});
