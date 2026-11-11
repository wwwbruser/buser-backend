const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); // Necessário para ler o JSON que o frontend envia

app.get('/api/clickbus/search', async (req, res) => {
  const { origem, destino, data } = req.query;

  if (!origem || !destino || !data) {
    return res.status(400).json({ error: 'Faltando parâmetros: origem, destino ou data.' });
  }

  // A GeckoAPI exige a separação da Cidade e do Estado (UF).
  // O frontend envia "Imperatriz, MA". Vamos separar.
  const [origemCidade, origemUF] = origem.split(',').map(s => s.trim());
  const [destinoCidade, destinoUF] = destino.split(',').map(s => s.trim());

  if (!origemCidade || !origemUF || !destinoCidade || !destinoUF) {
    return res.status(400).json({ error: 'Formato inválido. Envie "Cidade, UF".' });
  }

  try {
    const apiKey = process.env.GECKO_API_KEY;
    if (!apiKey) {
      console.error('❌ ERRO: Variável GECKO_API_KEY não configurada no Render!');
      return res.status(500).json({ error: 'Chave da API não configurada no servidor.' });
    }

    // ✅ URL OFICIAL DA GECKOAPI (conforme documentação)
    const apiUrl = 'https://api.geckoapi.com.br/v1/extract';

    // ✅ CORPO DA REQUISIÇÃO (o que a GeckoAPI espera)
    const payload = {
      target: "clickbus.com.br",
      type: "plp",
      originCity: origemCidade,
      originState: origemUF,
      destinationCity: destinoCidade,
      destinationState: destinoUF,
      departureDate: data, // Formato YYYY-MM-DD (ex: 2026-11-20)
      page: 1
    };

    const response = await fetch(apiUrl, {
      method: 'POST', // GeckoAPI usa POST, não GET
      headers: {
        'Authorization': `Bearer ${apiKey}`, // Autenticação via Bearer
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload) // Converte o objeto para JSON string
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Erro da GeckoAPI (${response.status}):`, errorText);
      return res.status(response.status).json({ error: `GeckoAPI falhou com status ${response.status}` });
    }

    const dataJson = await response.json();

    // ✅ A GeckoAPI retorna { data: { items: [...] } }.
    // O frontend espera um array direto. Então, extraímos os itens.
    if (dataJson && dataJson.data && dataJson.data.items) {
      return res.json(dataJson.data.items);
    } else {
      // Se não houver itens (ex: data: null), retorna array vazio
      return res.json([]);
    }

  } catch (error) {
    console.error('❌ Erro no servidor proxy:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor ao buscar viagens.' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
