import { validateVeeamBackupTimelineMock } from './veeam-timeline';

export function runVeeamBackupTimelineValidation() {
  const result = validateVeeamBackupTimelineMock();
  if (!result.ok) {
    throw new Error(`Falha na validacao mockada da timeline Veeam: ${result.details.join(' | ')}`);
  }
  return result;
}

if (require.main === module) {
  const result = runVeeamBackupTimelineValidation();
  console.log('Validacao mockada da timeline Veeam concluida com sucesso.', result);
}
