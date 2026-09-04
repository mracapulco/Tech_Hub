/**
 * Deixa cada palavra com a inicial maiúscula (ex.: "EMPRESA EXEMPLO LTDA" -> "Empresa Exemplo Ltda").
 * Uso: dados de texto vindos de fontes externas (ex.: nome de cliente importado de um distribuidor)
 * que chegam em caixa alta e são só exibidos — nunca aplicar ao valor persistido, já que a próxima
 * sincronização reescreve o campo com o valor original da fonte.
 */
export function titleCase(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}
