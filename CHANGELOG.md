# Changelog

Todas as mudanças relevantes deste projeto serão documentadas aqui.

Formato inspirado no Keep a Changelog e versionamento semântico quando aplicável.

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