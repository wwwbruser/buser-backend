function extrairTerminalBackend(v, tipo) {
    // Tenta achar o objeto do terminal em várias camadas do JSON
    let t = v[tipo]?.terminal || v[tipo]?.location || v[tipo]?.station || v[tipo]?.place || v[tipo]?.stop || 
            v.legs?.[0]?.[tipo]?.terminal || v.legs?.[0]?.[tipo]?.location || v.trip?.[tipo]?.terminal;

    if (!t) return { name: 'Rodoviária', address: '' };
    if (typeof t === 'string') return { name: t, address: '' };

    // Pega o nome
    let name = t.name || t.nome || t.terminal || t.title || t.label || 'Rodoviária';
    
    // Pega o endereço (tenta várias propriedades)
    let address = '';
    const endCandidatos = [
        t.address, t.endereco, t.full_address, t.address_line,
        t.location?.address, t.location?.endereco, t.place?.address
    ];
    for (let c of endCandidatos) {
        if (c && typeof c === 'string' && c.trim()) { address = c.trim(); break; }
    }

    // ✂️ A TESOURA MÁGICA: Limpa o endereço removendo o telefone do final
    if (address) {
        // Remove padrões como "(99) 3524-1276", "(11) 99999-9999", "99 3524-1276", etc.
        address = address.replace(/\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/g, '');
        
        // Remove vírgulas, traços ou espaços que sobrarem no final do texto
        address = address.replace(/[,\-\s]+$/, '').trim();
    }

    return { name, address };
}
