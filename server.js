const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Puxa as chaves salvas no painel do Render
const GECKO_API_KEY = process.env.GECKO_API_KEY; 
const BLACKCAT_API_KEY = process.env.BLACKCAT_API_KEY; 

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
    console.error("Erro Gecko:", error.response ? error.response.data : error.message);
    res.json([]); 
  }
});

app.post('/api/pix', async (req, res) => {
  const { amount, customer } = req.body;

  try {
    if (!BLACKCAT_API_KEY) {
      return res.status(400).json({ error: 'Chave da BlackCat não configurada no Render.' });
    }

    const response = await axios.post('https://api.blackcatoficial.com/api/sales/create-sale', {
      amount: amount,
      paymentMethod: 'PIX',
      customer: {
        name: customer.name,
        document: customer.document
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': BLACKCAT_API_KEY
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error("Erro BlackCat:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Erro ao gerar PIX na BlackCat' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
