import { redirect } from 'next/navigation';

export default function LegacyIntegracoesRedirect() {
  redirect('/configuracoes/ia');
  return null;
}