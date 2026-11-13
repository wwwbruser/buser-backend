const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Simulação da fila em memória
const filaPedidos = {};

app.get('/api/clickbus/search', (req, res) => {
    const { origem, destino, data } = req.query;
    if (!origem || !destino || !data) return res.status(400).json({ error: 'Faltando parâmetros.' });

    const pedidoId = uuidv4();
    filaPedidos[pedidoId] = { status: 'processando', origem, destino, data };
    
    // Responde na hora
    res.status(202).json({ message: 'Busca em andamento.', pedidoId });

    // Gera as viagens após 2 segundos (simulando o Worker)
    setTimeout(() => {
        filaPedidos[pedidoId] = {
            status: 'concluido',
            resultado: [
                { id: uuidv4(), company: { name: 'Catedral', logo: '' }, price: 150.00, bus_type: 'Executivo', total_seats: 46, occupied_seats: [2,5,8,12,15], departure: { time: '08:00', city: origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } }, arrival: { time: '14:15', city: destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } } },
                { id: uuidv4(), company: { name: 'Nacional', logo: '' }, price: 180.00, bus_type: 'Convencional', total_seats: 46, occupied_seats: [3,7,11,19,25], departure: { time: '14:00', city: origem.split(',')[0], terminal: { name: 'Rodoviária Principal', address: '' } }, arrival: { time: '19:45', city: destino.split(',')[0], terminal: { name: 'Terminal Rodoviário', address: '' } } }
            ]
        };
    }, 2000);
});

app.get('/api/clickbus/resultado/:pedidoId', (req, res) => {
    const pedido = filaPedidos[req.params.pedidoId];
    if (!pedido) return res.status(404).json({ error: 'Não encontrado' });
    res.json(pedido);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor simples rodando na porta ${PORT}`));
