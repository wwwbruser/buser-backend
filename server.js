const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// 🔒 FIREBASE
// ============================================================
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://projeto-link-ddbf0-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Admin inicializado com sucesso.");
  } catch (error) {
    console.error("❌ ERRO CRÍTICO no Firebase:", error.message);
  }
}
const db = admin.database();

// ============================================================
// ROTAS DO WEB SERVICE (RESPOSTA RÁPIDA)
// ============================================================
app.get('/api/clickbus/search', async (req, res) => {
    const { origem, destino, data } = req.query;
    if (!origem || !destino || !data) return res.status(400).json({ error: 'Faltando parâmetros.' });

    const pedidoId = uuidv4();
    try {
        await db.ref(`fila_pedidos/${pedidoId}`).set({ status: 'processando', origem, destino, data, criadoEm: Date.now() });
        console.log(`📥 Pedido ${pedidoId} enfileirado.`);
        res.status(202).json({ message: 'Busca em andamento.', pedidoId });
    } catch (error) {
        console.error('Erro ao enfileirar:', error.message);
        res.status(500).json({ error: 'Erro ao criar pedido.' });
    }
});

app.get('/api/clickbus/resultado/:pedidoId', async (req, res) => {
    const { pedidoId } = req.params;
    try {
        const snapshot = await db.ref(`fila_pedidos/${pedidoId}`).once('value');
        const pedido = snapshot.val();
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
        if (pedido.status === 'processando') return res.status(202).json({ status: 'processando' });
        if (pedido.status === 'erro') return res.status(500).json({ status: 'erro', message: pedido.erro });
        res.json({ status: 'concluido', data: pedido.resultado });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao consultar.' });
    }
});

// ============================================================
// WORKER (GERADOR DE VIAGENS INTELIGENTE)
// ============================================================
console.log('Worker iniciado. Gerador de viagens pronto...');

db.ref('fila_pedidos').on('child_added', async (snapshot) => {
    const pedidoId = snapshot.key;
    const pedido = snapshot.val();
    if (pedido.status !== 'processando') return;

    console.log(`\n⚙️ Gerando viagens para: ${pedido.origem} -> ${pedido.destino}`);

    try {
        const [origemCidade] = pedido.origem.split(',').map(s => s.trim());
        const [destinoCidade] = pedido.destino.split(',').map(s => s.trim());
        
        // 🔥 GERADOR DE VIAGENS FICTÍCIAS (MOCK)
        const empresas = ['Catedral', 'Nacional', 'Gontijo', 'Expresso do Sul', 'Itapemirim', 'Águia Branca'];
        const tipos = ['Executivo', 'Convencional', 'Semi-leito', 'Leito'];
        
        // Sorteia entre 3 e 5 viagens para parecer real
        const qtdViagens = Math.floor(Math.random() * 3) + 3; 
        const resultado = [];

        for (let i = 0; i < qtdViagens; i++) {
            const empresa = empresas[Math.floor(Math.random() * empresas.length)];
            const tipo = tipos[Math.floor(Math.random() * tipos.length)];
            const precoBase = Math.floor(Math.random() * 200) + 100; // Preço entre 100 e 300
            
            // Gera horário de saída aleatório (entre 5h e 23h)
            const horaSaida = Math.floor(Math.random() * 18) + 5;
            const minutoSaida = Math.random() > 0.5 ? '30' : '00';
            const timeSaida = `${String(horaSaida).padStart(2, '0')}:${minutoSaida}`;
            
            // Horário de chegada (saída + 6 horas em média)
            const horaChegada = (horaSaida + 6) % 24;
            const timeChegada = `${String(horaChegada).padStart(2, '0')}:${minutoSaida}`;

            // 🔥 Lógica das poltronas aleatórias (35% exatos)
            const totalAssentos = 46;
            const qtdOcupadas = Math.floor(totalAssentos * 0.35);
            const todasPoltronas = Array.from({length: totalAssentos}, (_, i) => i + 1);
            let seed = (pedidoId + i).toString().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            for (let k = todasPoltronas.length - 1; k > 0; k--) {
                seed = (seed * 9301 + 49297) % 233280;
                const j = Math.floor((seed / 233280) * (k + 1));
                [todasPoltronas[k], todasPoltronas[j]] = [todasPoltronas[j], todasPoltronas[k]];
            }

            resultado.push({
                id: uuidv4(),
                company: { name: empresa, logo: '' },
                price: precoBase,
                bus_type: tipo,
                total_seats: totalAssentos,
                occupied_seats: todasPoltronas.slice(0, qtdOcupadas),
                departure: { 
                    time: timeSaida, 
                    city: origemCidade, 
                    terminal: { name: 'Rodoviária Principal', address: '' } 
                },
                arrival: { 
                    time: timeChegada, 
                    city: destinoCidade, 
                    terminal: { name: 'Terminal Rodoviário', address: '' } 
                }
            });
        }

        await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'concluido', resultado, concluidoEm: Date.now() });
        console.log(`✅ Viagens geradas com sucesso para ${pedidoId}.`);

    } catch (error) {
        console.error(`❌ Falha no pedido ${pedidoId}:`, error);
        await db.ref(`fila_pedidos/${pedidoId}`).update({ status: 'erro', erro: 'Erro ao gerar viagens.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
