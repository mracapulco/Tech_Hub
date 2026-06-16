## [0.4.2] - 2026-06-16

### Adicionado
- Gestao • Backup: novo relatorio Veeam em rota dedicada, com linha do tempo diaria baseada no historico do item `veeam.get.metrics` do Zabbix.
- Gestao • Backup: exportacoes CSV e PDF para o relatorio, com PDF em layout horizontal, cabecalho institucional e timeline visual para compartilhamento com clientes.
- Sobre: tela atualizada com logo da plataforma, resumo institucional, versao atual e changelog da release exibida na instalacao.

### Alterado
- Gestao • Backup: a pagina inicial do modulo passa a funcionar como hub de navegacao, com entrada explicita para o relatorio Veeam em vez de abrir o relatorio diretamente.
- Gestao • Backup: coluna `Resultado` removida da tabela web e das exportacoes, mantendo a leitura por cores na timeline e os cards de resumo.
- Gestao • Backup: geracao de PDF reformulada para seguir o padrao visual dos outros relatorios do Tech Hub.

### Corrigido
- Integracao Zabbix • Backup: validacao do item `veeam.get.metrics` e leitura do historico texto com tratamento distinto para item nao encontrado, item sem historico, JSON invalido e ausencia de `sessions.data`.
- Gestao • Backup: timeline diaria corrigida para tratar sessoes cruzando o dia, execucoes em andamento (`Running`), buckets de 15/30/60 minutos e formatacao correta dos horarios.
- Exportacoes • Backup: CSV ajustado para compatibilidade com Excel/PT-BR e PDF ajustado para nao depender de popup bloqueado.

### Operacional
- Versoes atualizadas: root e web `0.4.2`.
