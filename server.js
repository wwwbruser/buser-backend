const PORT = process.env.PORT || 10000;

// Garante que o navegador seja fechado mesmo se ocorrer um erro inesperado
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

// Aumenta o tempo que o servidor mantém a conexão aberta com o proxy do Render
server.keepAliveTimeout = 120000; // 120 segundos
server.headersTimeout = 125000;   // Um pouco maior que o keepAlive
