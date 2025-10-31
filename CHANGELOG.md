# Changelog

Todas as mudanças relevantes deste projeto serão documentadas aqui.

Formato inspirado no Keep a Changelog e versionamento semântico quando aplicável.

## [0.2.0] — 2025-10-31

### Adicionado
- Listagem de empresas: coluna “Logo” com miniatura e placeholder quando ausente.
- Listagem de empresas: coluna “Usuários” entre “Nome Fantasia” e “Estado”, exibindo `membershipsCount`.
- API: `GET /companies` retorna `membershipsCount` agregado por empresa (evita N+1 no cliente).

### Alterado
- Listagem de empresas: colunas reorganizadas para `Logo`, `Nome Fantasia`, `Usuários`, `Estado`, `Cidade`, `Telefone`, `Ações`.
- Sidebar: botão de “três linhas” passa a alternar recolher/expandir; largura recolhida ajustada para `w-16`.
- Sidebar: item “Configurações” movido para o final dos itens de navegação.

### Removido
- Sidebar: saudação “Olá, {nome}” abaixo de “Tech Hub”.

### Observações
- Erros `net::ERR_ABORTED` no preview do Next.js durante transições são esperados e não afetam a funcionalidade.
- Versões atualizadas: root, web e api para `0.2.0`.

## 2025-10-31

### Adicionado
- Visualização detalhada do teste: tabela de resumo por grupo com colunas "Categoria", "Pontuação", "Graduação (%)" e "Tier", além da linha "GERAL".
- Gráfico radar em SVG com escala 0–100% para os grupos (Detectar, Responder, Recuperar, Governança, Identificar, Proteger).

### Alterado
- Visualização detalhada: rótulos do gráfico radar reposicionados para caberem dentro do SVG, com fonte menor e centralização.
- Visualização detalhada: removida a linha de resumo com porcentagens por grupo no topo (redundante com a nova tabela).
- Visualização detalhada: tabela simplificada para mostrar apenas "Pergunta" e "Resposta" com rótulos claros (Não/Parcial/Sim).
- Layout do app: barra lateral (menu) fixa; somente o conteúdo principal rola.

### Removido
- Listagem de maturidade: remoção dos botões "Exportar" e "Importar".

### Observações
- Os testes continuam armazenados em `localStorage` (`cyber:maturity:list`). Em futuras versões, considerar persistência via API.