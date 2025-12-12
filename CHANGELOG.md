# Changelog

Todas as mudanças relevantes deste projeto serão documentadas aqui.

Formato inspirado no Keep a Changelog e versionamento semântico quando aplicável.

## [0.3.6] — 2025-12-02

### Adicionado
- IPAM: modelos Prisma `Site`, `Vlan`, `Vrf` e vínculos em `IpSubnet` (siteId/vlanId/vrfId).
- API: módulos `Sites` e `VLANs` com listagem/criação; IPAM expandido com filtros e estatísticas de ocupação.
- Permissões: escrita (criar/editar/excluir) restrita a admin/técnico; clientes somente leitura (aplicado em IPAM, Sites e VLANs).
- Web (IPAM): páginas para Sites, VLANs e IPAM com vínculo por empresa; exportação CSV/PDF com logo do cliente e Tech Hub.
- Web (IPAM): ordenação por colunas (Nome, CIDR, Descrição) e exibição das colunas “Site” e “VLAN”.

### Alterado
- Web (Sidebar): seção “Gestão” com itens IPAM, Sites e VLANs.
- Web (IPAM): removida a seção de “Planejar Endereçamento por Site” após testes; mantido painel de ocupação e exportação.
- Infra: `docker-compose.yml` ajustado para usar `NEXT_PUBLIC_API_URL` do `.env` (acesso em rede local).

### Operacional
- Build e subida de containers `api` e `web`; sincronização de schema Prisma via compose.
- Preparação para integração Zabbix: base de Settings com criptografia (`CONFIG_MASTER_KEY`).

## [0.3.5] — 2025-11-27

### Adicionado
- Arquivo `docker-compose.prod.yml` para execução em produção (Ubuntu LTS), com `NODE_ENV=production`, reinício automático e separação de serviços `db`, `api` e `web`.

### Alterado
- Configuração de build da `web` via argumento `NEXT_PUBLIC_API_URL` no compose de produção.
- Versões atualizadas: root e web `0.3.5`.

### Operacional
- Preparação para deploy em servidor (instalação do Docker e Compose, criação de `.env` com `JWT_SECRET` e `CONFIG_MASTER_KEY`).
- Publicação como versão principal em `main` a partir do estado atual.

## [0.3.4] — 2025-11-04

### Adicionado
- Web (Maturidade • Análise por IA): página dedicada de análise estruturada por domínios (Identify, Protect, Detect, Respond, Recover, Governance), exibindo estado atual, lacunas e roadmap por ações.
- Web (Análise por IA): botão "Voltar" com retorno à página anterior; bloco introdutório sobre processamento interno e confidencialidade; aviso de que a análise deve ser validada pelo time de segurança.
- Web (Exportação): opções CSV e PDF na análise por IA, com cabeçalho personalizado no PDF (logo do cliente e "Powered by Tech Hub"); resumo do roadmap com total de ações, somatório de esforço e prazo total.

### Corrigido
- Web (Autorização): detecção de papéis (admin/técnico) usando `memberships` via API de usuário, evitando erro de tipo em `AuthUser` e garantindo consistência com páginas originais.

### Operacional
- Containers: rebuild e subida de `web` e `api`; validação visual das mudanças na página de análise por domínios.

### Observações
- Versões atualizadas: root e web `0.3.4`; API permanece `0.2.0`.

## [0.3.3] — 2025-11-03

### Adicionado
- Web (Dispositivos): reintrodução da importação via YAML nas páginas de criação e edição, utilizando `js-yaml` para preencher automaticamente Tipo, Marca, campos básicos e arrays (`console-ports`, `interfaces`, `module-bays`).

### Alterado
- Web: inclusão de `@types/js-yaml` nas devDependencies para tipagem adequada e compatibilidade com o build de produção.

### Operacional
- Rebuild e subida do `web` em produção; validação da UI nas páginas com a seção “Importar YAML (NetBox)”.

### Observações
- Compatível com exportações do NetBox; o mapeamento depende das chaves presentes no arquivo.

## [0.3.2] — 2025-11-03

### Alterado
- Web (Dispositivos): remoção completa da funcionalidade de importação YAML nas páginas de edição e criação para compatibilidade com build de produção.
- Web: migração para execução em produção (`web`) e descontinuação do ambiente de desenvolvimento (`web-dev`).

### Corrigido
- Build de produção do `web`: erros TypeScript relacionados a `js-yaml` (declarações ausentes e referência a `yaml.load`).

### Operacional
- Containers: parada e remoção de `web-dev`; rebuild e subida do `web` em produção.
- Validação: revisão visual de `http://localhost:3000/configuracoes/dispositivos` sem erros.

### Observações
- A API continua disponível em `http://localhost:4000`.

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
## [0.3.7] — 2025-12-03

### Adicionado
- Integração Zabbix (web): página em Configurações com formulário de URL/Token/Prefixo e botão de sincronização, incluindo modo debug com métricas detalhadas.
- PDF IPAM: resumo com cards (subnets, IPs usados, ocupação média) e "Top 10 por ocupação" com barras SVG e ajuste de cores para impressão.
- Ordenação no IPAM por "Site" e "VLAN"; exportações (CSV/PDF) respeitam a ordenação da visualização.

### Alterado
- Filtro de grupos do Zabbix: estrito por prefixo (nome igual ou `prefixo/…`) e busca prévia de `groupids` via `hostgroup.get`.
- Sincronização Zabbix: opção de fallback DNS (controlada na UI), timeouts nas chamadas e contadores de debug (sem IP/fora de faixa/removidos por filtro).
- PDF IPAM: impressão mais confiável com SVG; cabeçalho e layout aprimorados.

### Corrigido
- Cálculo de matching de CIDR por inteiros (start/end) para faixas como `192.168.1.0/24` e semelhantes.
- Respeito à ordenação escolhida na tela ao exportar CSV e PDF.

## [0.3.8] — 2025-12-05

### Adicionado
- Licenciamento — Firewall: vínculo de licença a um IP já cadastrado no IPAM (`ipAddressId`) com validação de empresa/site.
- Web: seleção de Subnet/IP no cadastro e edição de Firewall; envio de `ipAddressId` ao backend.
- Licenciamento: novas páginas “Antivírus” e “Microsoft” com conteúdo inicial (“Em desenvolvimento”).
- Sidebar: submenu “Licenciamento” dentro de Gestão com itens Firewall, Antivírus e Microsoft.
- Web/API Proxy: rotas `/api/*` no Next encaminhando para o serviço `api` (melhor acesso em rede local).

### Alterado
- Integração Zabbix (web): URL pré-preenchida `https://zabbix.techmaster.inf.br` e `Prefixo` obrigatório com hint “CLIENTE/TECHUB”.
- Dashboard: correções nas visualizações — deduplicação de firewalls por `serial`; “Top por ocupação” do IPAM deduplicado por nome+CIDR.
- Acesso em rede: ajustes para que o frontend use `/api` como base, evitando dependência da porta 4000 externa.

### Corrigido
- Prisma: relação `FirewallLicense ↔ IpAddress` com lado oposto e nome de relação; sincronização do schema.
- Compose (prod): limpeza de linha inválida, garantindo build/run estáveis.

### Operacional
- Rebuild de `web` e `api`; containers reiniciados; validação de acesso externo em `http://<host>:3000`.
- Versões atualizadas: root e web `0.3.8`; api `0.2.1`.

## [0.3.9] — 2025-12-05

### Corrigido
- Proxy `/api/*` do frontend agora preserva query string (`?companyId=...`, `?siteId=...`), garantindo filtros de empresa/site em Sites, Subnets e Zabbix.
- IPAM (edição de subnet): campo “Site” adicionado para vincular subnets corretamente.
- IPAM (Sites): edição inclui “Empresa”; backend aceita mover sites entre empresas com validação de permissões.

### Alterado
- Passo de rebuild validado para execução em rede local com proxy `/api`.

### Operacional
- Rebuild do `web` e restart dos containers; validações funcionais em IPAM → Sites/Subnets e Dashboard.

## [0.3.10] — 2025-12-05

### Corrigido
- Dashboard — “Firewall — próximos a expirar”: inclui itens já vencidos (dias negativos) e ordena com vencidos no topo.

### Operacional
- Versões atualizadas: root e web `0.3.10`.

## [0.3.11] — 2025-12-05

### Adicionado
- IPAM: preenchimento automático do “Nome do Subnet” e “Descrição” ao selecionar Empresa + Site + VLAN (usa `name` e `purpose` da VLAN).

### Operacional
- Versões atualizadas: root e web `0.3.11`.

## [0.3.12] — 2025-12-11

### Adicionado
- Licenciamento — Firewall: campo “Número da licença” e rótulo “Tipo da licença”.

### Corrigido
- Licenciamento — Firewall (lista/cadastro/edição): rótulos e persistência de `licenseNumber` em API e UI.

### Operacional
- Rebuild do `web` e restart de containers.

## [0.3.13] — 2025-12-12

### Adicionado
- Licenciamento — Firewall: upload de PDF da licença (somente `application/pdf`).
- Licenciamento — Firewall (edição): painel lateral com visualização do PDF e link para abrir em nova aba.
- Licenciamento — Firewall (lista): coluna "Anexo" com indicador 📎 ✓ quando houver PDF e botão "Visualizar".

### Corrigido
- Funções de upload movidas para dentro dos componentes com acesso ao `token`.

### Operacional
- Versões atualizadas: root e web `0.3.13`; api `0.2.3`.
