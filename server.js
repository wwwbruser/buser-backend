const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // npm install uuid

const app = express();
app.use(cors());
app.use(express.json());

// --- SIMULAÇÃO DA FILA (Em produção, use o Redis do Render) ---
// Aqui guardamos os pedidos na memória. Se o servidor reiniciar, perde.
const filaDePedidos = {}; 

app.get('/api/clickbus/search', (req, res) => {
    const { origem, destino, data } = req.query;
    
    if (!origem || !destino || !data) {
        return res.status(400).json({ error: 'Faltando parâmetros.' });
    }

    // 1. Cria um ID único para este pedido
    const pedidoId = uuidv4();

    // 2. Coloca o pedido na "fila" (em memória por enquanto)
    filaDePedidos[pedidoId] = {
        status: 'processando',
        origem,
        destino,
        data,
        resultado: null,
        criadoEm: Date.now()
    };

    console.log(`📥 Pedido ${pedidoId} enfileirado.`);

    // 3. Responde IMEDIATAMENTE para o usuário (não espera a ClickBus)
    res.status(202).json({ 
        message: 'Busca em andamento. Use o ID para consultar o resultado.',
        pedidoId: pedidoId
    });
});

// Rota para o frontend consultar se o pedido já terminou
app.get('/api/clickbus/resultado/:pedidoId', (req, res) => {
    const { pedidoId } = req.params;
    const pedido = filaDePedidos[pedidoId];

    if (!pedido) {
        return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    if (pedido.status === 'processando') {
        return res.status(202).json({ status: 'processando', message: 'Ainda estamos buscando...' });
    }

    if (pedido.status === 'erro') {
        return res.status(500).json({ status: 'erro', message: pedido.erro });
    }

    // Se chegou aqui, está pronto
    res.json({ status: 'concluido', data: pedido.resultado });
});

// Rota de health check para o Render
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web Service rodando na porta ${PORT}`);
    console.log('Aguardando pedidos...');
});
