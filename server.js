    try {
      // Chama o SEU servidor no Render
      const response = await fetch(`https://buser-online.onrender.com/api/clickbus/search?origem=${encodeURIComponent(origemTexto)}&destino=${encodeURIComponent(destinoTexto)}&data=${dataIda}`);
      
      if (!response.ok) throw new Error('Erro na resposta do servidor');
      const viagens = await response.json();

      if (!viagens || viagens.length === 0) {
        listaViagens.innerHTML = `<div style="text-align: center; padding: 40px 20px; background:#fff; border-radius:16px; border:1px solid #e0e0e0;"><span style="font-size: 40px;">🚌</span><h3 style="margin-top: 10px; color: #454545;">Nenhuma viagem encontrada</h3><p style="color: #757575;">Não achamos ônibus para essa rota nessa data. Tente mudar o dia ou escolher outra cidade.</p></div>`;
        return;
      }

      viagensOriginais = viagens;
      gerarFiltros(viagens);
      renderizarViagens(viagens);
      filtrosSidebar.style.display = 'block';
    } catch (error) { ... }
