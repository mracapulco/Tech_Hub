# Changelog

Todas as mudanças relevantes deste projeto serão documentadas aqui.

Formato inspirado no Keep a Changelog e versionamento semântico quando aplicável.

## [0.3.1] — 2025-11-02

### Alterado
- Sidebar: logo `logo_white.svg` ajustada para largura 88px e altura proporcional 62px (viewBox 29700x21000).
- Sidebar: reduzido espaçamento vertical do cabeçalho (`py-0`) e do menu (`pt-0` no primeiro item), eliminando o vão sob a logo.
- Sidebar: centralização correta do cabeçalho e do ícone no modo recolhido; altura fixa `h-16` para manter mesma posição vertical dos ícones entre estados.
- Sidebar: ajustes de padding finos (`p-1` no botão do menu; links com `pt-0 pb-2`).

### Observações
- Versões atualizadas: root e web `0.3.1`.
- Erros `net::ERR_ABORTED` em rotas do Next.js durante transições/prefetch são esperados e não afetam a funcionalidade.

## [0.3.0] — 2025-11-01

### Adicionado
- Maturidade: botão "Exportar" na visualização com opções PDF e CSV.
- Maturidade (PDF): relatório formatado com logo da empresa, introdução e observação final.
- Maturidade (CSV): exporta perguntas e respostas, mais resumo por grupo e geral.

### Alterado
- Login: textos e placeholders traduzidos para pt-BR ("Acesse sua conta", "Usuário ou e-mail", "Senha", "Esqueceu a senha?").

### Observações
- Versões atualizadas: root e web `0.3.0`; API permanece `0.2.0`.
- Erros `net::ERR_ABORTED` em prefetch de rotas do Next.js são esperados e não afetam a funcionalidade.

## [0.2.1] — 2025-11-01

### Adicionado
- Listagem de usuários: zebra striping nas linhas para leitura facilitada.
- Listagem de usuários: estado vazio com card informativo e CTAs ("Novo Cliente" e "Novo Administrador/Técnico").
- Cabeçalho da seção "Usuários cadastrados" com descrição contextual.

### Alterado
- Padronização visual das telas de usuários (criação/listagem e detalhe/edição): containers, inputs, selects, botões e mensagens conforme estilo base.
- Botões e ações com estilos consistentes conforme tema Tailwind.
- Metadados do app ajustados para usar `favicon.ico` no `layout.tsx`.

### Corrigido
- Favicon não atualizava devido à referência anterior para `/favicon.svg`.

### Observações
- Versões atualizadas: root e web `0.2.1`.
- Caso a mudança do favicon não apareça, fazer hard refresh ou abrir em aba anônima.

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