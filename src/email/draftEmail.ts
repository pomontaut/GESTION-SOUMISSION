import type { Lot, SubmissionInfo } from '../types'

export function buildLotEmail(lot: Lot, info: SubmissionInfo): { subject: string; body: string } {
  const subject = `Demande de prix — ${lot.title}${info.projectName ? ' — ' + info.projectName : ''}`
  const deadlineTxt = info.deadline ? new Date(info.deadline).toLocaleDateString('fr-CH') : '[date limite]'
  const body = [
    `DATE DE REPONSE SOUHAITEE : ${deadlineTxt}`,
    '',
    'Bonjour,',
    '',
    `Merci de bien vouloir nous transmettre votre offre pour les prestations décrites selon soumission ci-annexée (${lot.prestationType === 'fourniture' ? 'fourniture uniquement' : 'fourniture et pose'}).`,
    '',
    "N'hésitez pas à chiffrer l'ensemble des positions qui vous intéressent et à proposer des variantes qui vous semblent pertinentes.",
    '',
    `Plans : ${info.projectName || '[Nom du projet]'} - ${info.siteLocation || '[Ville]'}`,
    '',
    'MERCI DE MENTIONNER LES REFERENCES SUIVANTES SUR VOTRE MAIL DE RETOUR :',
    `${info.siteNumber || '[N° de chantier]'} - ${info.projectName || '[Nom du projet]'} - ${info.siteLocation || '[Ville]'}`,
    '',
    `Calculateur : ${info.calculatorName || '[Nom]'} — ${info.calculatorEmail || ''} — ${info.calculatorPhone || ''}`,
  ].join('\n')

  return { subject, body }
}
