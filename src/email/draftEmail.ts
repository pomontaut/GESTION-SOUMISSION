import type { Lot, SubmissionInfo } from '../types'

/** Objet : « Demande de prix — n° - nom de la soumission » (jamais le nom du lot). */
function requestSubject(info: SubmissionInfo): string {
  const ref = [info.siteNumber, info.projectName].filter(Boolean).join(' - ')
  return `Demande de prix${ref ? ' — ' + ref : ''}`
}

export function buildLotEmail(lot: Lot, info: SubmissionInfo): { subject: string; body: string } {
  const subject = requestSubject(info)
  return {
    subject,
    body: composeBody(
      info,
      `Merci de bien vouloir nous transmettre votre offre pour les prestations décrites selon soumission ci-annexée (${lot.prestationType === 'fourniture' ? 'fourniture uniquement' : 'fourniture et pose'}).`,
    ),
  }
}

/** Un seul e-mail pour plusieurs lots d'un même fournisseur (onglet « Envoi par fournisseur »). */
export function buildSupplierEmail(lots: Lot[], info: SubmissionInfo): { subject: string; body: string } {
  if (lots.length === 1) return buildLotEmail(lots[0], info)
  const subject = requestSubject(info)
  const list = lots.map(
    (l) => `- ${l.cfcCode ? 'CFC ' + l.cfcCode + ' — ' : ''}${l.title} (${l.prestationType === 'fourniture' ? 'fourniture uniquement' : 'fourniture et pose'})`,
  )
  return {
    subject,
    body: composeBody(
      info,
      ['Merci de bien vouloir nous transmettre votre offre pour les lots suivants, décrits selon soumission ci-annexée (un seul PDF regroupant tous les lots) :', '', ...list].join('\n'),
    ),
  }
}

function composeBody(info: SubmissionInfo, requestText: string): string {
  const deadlineTxt = info.deadline ? new Date(info.deadline).toLocaleDateString('fr-CH') : '[date limite]'
  return [
    `DATE DE REPONSE SOUHAITEE : ${deadlineTxt}`,
    '',
    'Bonjour,',
    '',
    requestText,
    '',
    "N'hésitez pas à chiffrer l'ensemble des positions qui vous intéressent et à proposer des variantes qui vous semblent pertinentes.",
    '',
    `Plans : ${info.projectName || '[Nom du projet]'} - ${info.siteLocation || '[Ville]'}`,
    '',
    // The e-mail body is sent as plain text (see server/src/resend.ts) - a bare URL on its own
    // line is what mail clients (Outlook, Gmail, ...) auto-linkify into a clickable link, so no
    // HTML markup is needed here for the fournisseur to be able to click through.
    ...(info.documentsLink ? [`Documents de la soumission : ${info.documentsLink}`, ''] : []),
    'MERCI DE MENTIONNER LES REFERENCES SUIVANTES SUR VOTRE MAIL DE RETOUR :',
    `${info.siteNumber || '[N° de chantier]'} - ${info.projectName || '[Nom du projet]'} - ${info.siteLocation || '[Ville]'}`,
    '',
    `Contact en cas de questions : ${info.calculatorName || '[Nom]'} — ${info.calculatorEmail || ''}${info.calculatorPhone ? ' — ' + info.calculatorPhone : ''}`,
    '',
    'Avec nos meilleures salutations.',
    '',
    'Service achats',
    'Avenue des Grandes-Communes 6 | 1213 Petit-Lancy',
    'www.induni.ch',
  ].join('\n')
}
