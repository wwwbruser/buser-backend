const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const GECKO_API_KEY = process.env.GECKO_API_KEY; 

app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;
  console.log(`\n[Buscando]: ${origem} -> ${destino} | Data: ${data}`);

  // TRAVA DE SEGURANÇA: Se não vier origem ou destino, nem tenta buscar
  if (!origem || !destino || !data) {
    return res.json([]); 
  }

  try {
    const origemParts = origem.split(',').map(s => s.trim());
    const destinoParts = destino.split(',').map(s => s.trim());
    
    const payload = {
      target: 'clickbus.com.br',
      type: 'plp',
      page: 1,
      originCity: origemParts[0],
      originState: origemParts[1] || 'SP',
      destinationCity: destinoParts[0],
      destinationState: destinoParts[1] || 'SP',
      departureDate: data
    };

    const response = await axios.post('https://api.geckoapi.com.br/v1/extract', payload, {
      headers: { 'Authorization': `Bearer ${GECKO_API_KEY}`, 'Content-Type': 'application/json' }
    });
    
    let viagens = response.data && response.data.results ? response.data.results : [];
    console.log(`SUCESSO! ${viagens.length} viagens encontradas.`);
    res.json(viagens); 
    
  } catch (error) {
    console.error("Erro Gecko:", error.message);
    res.json([]); 
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
