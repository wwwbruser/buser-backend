const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // Se não tiver, rode npm install uuid

const app = express();
app.use(cors());
app.use(express.json());

// --- SIMULAÇÃO DA FILA (Em memória para teste) ---
const filaDePedidos = {}; 

app.get('/api/clickbus/search', (req, res) => {
    const { origem, destino, data } = req.query;
    
    if (!origem || !destino || !data) {
        return res.status(400).json({ error: 'Faltando parâmetros.' });
    }

    // Cria o ID do pedido
    const pedidoId = uuidv4();

    // Salva na fila como "processando"
    filaDePedidos[pedidoId] = {
        status: 'processando',
        origem,
        destino,
        data,
        resultado: null,
        criadoEm: Date.now()
    };

    console.log(`📥 Pedido ${pedidoId} enfileirado.`);

    // ⚡ RESPONDE NA HORA COM O ID (sem esperar a ClickBus)
    res.status(202).json({ 
        message: 'Busca em andamento.',
        pedidoId: pedidoId
    });
});

// Rota de consulta do resultado
app.get('/api/clickbus/resultado/:pedidoId', (req, res) => {
    const { pedidoId } = req.params;
    const pedido = filaDePedidos[pedidoId];

    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (pedido.status === 'processando') return res.status(202).json({ status: 'processando', message: 'Ainda estamos buscando...' });
    if (pedido.status === 'erro') return res.status(500).json({ status: 'erro', message: pedido.erro });

    res.json({ status: 'concluido', data: pedido.resultado });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web Service (Rápido) rodando na porta ${PORT}`);
});
