## [0.4.6] - 2026-09-04

### Adicionado
- Licenciamento Microsoft: sincronização automática por fornecedor (hoje Ingram Micro), com frequência configurável (1h a 7 dias) e execução manual continuando disponível a qualquer momento.
- Dashboard: novo bloco "Licenciamento Microsoft — próximos a vencer" com as 10 licenças mais próximas do vencimento (Empresa, Categoria, Venc., Dias), pronto para múltiplos fornecedores (Ingram hoje, ScanSource futuramente).
- Dashboard: os blocos de Firewall e de Licenciamento Microsoft agora são clicáveis e levam direto para o detalhe do item.

### Alterado
- Licenciamento Microsoft: histórico de sincronização passa a ser paginado (10 execuções por página, até 10 páginas), evitando uma lista que cresce sem limite.
- Dashboard: o bloco "Zabbix — Empresas integradas" foi substituído pelo novo bloco de licenciamento Microsoft.
- Dashboard: bloco de licenciamento Microsoft mostra a primeira palavra do nome da empresa (quando composto) para dar mais espaço às demais colunas.

### Corrigido
- Licenciamento Firewall: o painel de anexo não exibe mais um erro bruto do servidor quando o arquivo referenciado não existe mais — passa a mostrar "Nenhum anexo disponível.", como no caso de licenças sem anexo.
- Licenciamento Microsoft: nome de cliente importado do distribuidor (ex.: "EMPRESA EXEMPLO LTDA") agora é exibido com a inicial de cada palavra maiúscula em vez de tudo em caixa alta, em todas as telas do módulo (visão geral, mapeamentos, detalhe da assinatura, dashboard). O dado original continua intacto — a formatação é só de exibição.

### Operacional
- Versões atualizadas: root e web `0.4.6`.
