import { useEffect, useMemo, useState } from 'react'
import type { Lot, PrestationType, Submission, SupplierRecord } from '../types'
import { uid } from '../types'
import { listSuppliers, saveSupplier } from '../storage'
import { extractLotPdf } from '../pdf/extractPages'
import { ALL_CATEGORIES } from '../data/suppliers'

const INACTIVE_STATUSES = ['Ne pas consulter', 'Inactif / à exclure']

export default function LotsTab({
  submission,
  onUpdate,
}: {
  submission: Submission
  onUpdate: (s: Submission) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(submission.lots[0]?.id ?? null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([])
  const [previewLot, setPreviewLot] = useState<Lot | null>(null)

  useEffect(() => {
    listSuppliers().then(setSuppliers)
  }, [])

  const selectedLot = submission.lots.find((l) => l.id === selectedId) ?? null

  function updateLot(id: string, patch: Partial<Lot>) {
    onUpdate({
      ...submission,
      lots: submission.lots.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })
  }

  function deleteLot(id: string) {
    if (!confirm('Supprimer ce lot ?')) return
    onUpdate({ ...submission, lots: submission.lots.filter((l) => l.id !== id) })
    if (selectedId === id) setSelectedId(null)
  }

  function toggleCheck(id: string) {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChecked(next)
  }

  function mergeChecked() {
    const toMerge = submission.lots.filter((l) => checked.has(l.id))
    if (toMerge.length < 2) return
    const base = toMerge[0]
    const merged: Lot = {
      ...base,
      pages: Array.from(new Set(toMerge.flatMap((l) => l.pages))).sort((a, b) => a - b),
      zoneIds: toMerge.flatMap((l) => l.zoneIds),
      positionCount: toMerge.reduce((sum, l) => sum + l.positionCount, 0),
      categories: Array.from(new Set(toMerge.flatMap((l) => l.categories))),
      suppliers: toMerge.flatMap((l) => l.suppliers),
      followUp: toMerge.flatMap((l) => l.followUp),
    }
    onUpdate({
      ...submission,
      lots: [merged, ...submission.lots.filter((l) => !checked.has(l.id))],
    })
    setChecked(new Set())
    setSelectedId(merged.id)
  }

  return (
    <div className="grid grid-cols-[340px_1fr] gap-6">
      <datalist id="all-categories">
        {ALL_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div>
        <p className="text-sm text-slate-500 mb-2">
          Cochez plusieurs lots pour les fusionner en un seul (ex: si des articles distincts doivent en fait
          être sourcés ensemble).
        </p>
        {checked.size >= 2 && (
          <button className="btn-primary w-full mb-3" onClick={mergeChecked}>
            Fusionner {checked.size} lots sélectionnés
          </button>
        )}
        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {submission.lots.map((lot) => (
            <div
              key={lot.id}
              className={`card cursor-pointer !p-3 flex items-start gap-2 ${
                selectedId === lot.id ? 'border-indigo-400 ring-1 ring-indigo-200' : ''
              }`}
              onClick={() => setSelectedId(lot.id)}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={checked.has(lot.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleCheck(lot.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800 truncate">
                  CFC {lot.cfcCode} — {lot.title || '(sans titre)'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded ${lot.validated ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {lot.validated ? 'Validé' : 'Proposé'}
                  </span>
                  <span>p.{lot.pages.join(', ')}</span>
                  <span>· {lot.positionCount} position(s)</span>
                  <span>· {lot.prestationType === 'fourniture' ? 'Fourniture' : 'Fourniture+pose'}</span>
                </div>
              </div>
              <button
                title="Prévisualiser le PDF du lot"
                className="text-slate-400 hover:text-indigo-600 text-lg leading-none px-1"
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewLot(lot)
                }}
              >
                🔍
              </button>
            </div>
          ))}
          {submission.lots.length === 0 && (
            <p className="text-slate-500 text-sm">Aucun lot — importez un PDF dans l'onglet 1.</p>
          )}
        </div>
      </div>

      <div>
        {selectedLot ? (
          <LotDetail
            key={selectedLot.id}
            lot={selectedLot}
            submission={submission}
            suppliers={suppliers}
            onSuppliersChange={setSuppliers}
            onChange={(patch) => updateLot(selectedLot.id, patch)}
            onDelete={() => deleteLot(selectedLot.id)}
            onPreview={() => setPreviewLot(selectedLot)}
          />
        ) : (
          <div className="card text-slate-500">Sélectionnez un lot à gauche.</div>
        )}
      </div>

      {previewLot && submission.pdfData && (
        <PdfPreviewModal lot={previewLot} pdfData={submission.pdfData} onClose={() => setPreviewLot(null)} />
      )}
    </div>
  )
}

function PdfPreviewModal({ lot, pdfData, onClose }: { lot: Lot; pdfData: ArrayBuffer; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    extractLotPdf(pdfData, lot.pages)
      .then((bytes) => {
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((err) => {
        console.error(err)
        setError('Impossible de générer la prévisualisation.')
      })
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [lot, pdfData])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-medium text-slate-800 truncate">
            CFC {lot.cfcCode} — {lot.title} · pages {lot.pages.join(', ')}
          </h3>
          <button className="btn-secondary" onClick={onClose}>
            ✕ Fermer
          </button>
        </div>
        <div className="flex-1 bg-slate-100">
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {url && <iframe title="Prévisualisation du lot" src={url} className="w-full h-full border-0" />}
          {!url && !error && <p className="p-4 text-sm text-slate-500">Génération de la prévisualisation…</p>}
        </div>
      </div>
    </div>
  )
}

function LotDetail({
  lot,
  submission,
  suppliers,
  onSuppliersChange,
  onChange,
  onDelete,
  onPreview,
}: {
  lot: Lot
  submission: Submission
  suppliers: SupplierRecord[]
  onSuppliersChange: (s: SupplierRecord[]) => void
  onChange: (patch: Partial<Lot>) => void
  onDelete: () => void
  onPreview: () => void
}) {
  const [categoryInput, setCategoryInput] = useState('')
  const [newSupplier, setNewSupplier] = useState({ name: '', email: '', category: '' })
  const [pdfBusy, setPdfBusy] = useState(false)
  const [emailGenerated, setEmailGenerated] = useState(Boolean(lot.emailBody))

  const categoryMatches = useMemo(() => {
    if (!lot.categories.length) return []
    const norm = (s: string) => s.trim().toLowerCase()
    const wanted = new Set(lot.categories.map(norm))
    return suppliers.filter((s) => wanted.has(norm(s.category)))
  }, [suppliers, lot.categories])

  const activeMatches = categoryMatches.filter((s) => !INACTIVE_STATUSES.includes(s.status ?? ''))
  const inactiveMatches = categoryMatches.filter((s) => INACTIVE_STATUSES.includes(s.status ?? ''))

  function addCategory() {
    const v = categoryInput.trim()
    if (!v || lot.categories.includes(v)) return
    onChange({ categories: [...lot.categories, v] })
    setCategoryInput('')
  }

  function removeCategory(c: string) {
    onChange({ categories: lot.categories.filter((x) => x !== c) })
  }

  function addSupplierToLot(s: SupplierRecord) {
    if (lot.suppliers.some((x) => x.supplierId === s.id)) return
    onChange({ suppliers: [...lot.suppliers, { supplierId: s.id, name: s.name, email: s.email, status: 'valide' }] })
  }

  function removeSupplierFromLot(supplierId: string) {
    onChange({ suppliers: lot.suppliers.filter((s) => s.supplierId !== supplierId) })
  }

  async function createAndAddSupplier() {
    if (!newSupplier.name.trim()) return
    const record: SupplierRecord = { id: uid(), ...newSupplier, status: 'Actif / à confirmer' }
    await saveSupplier(record)
    onSuppliersChange([...suppliers, record])
    addSupplierToLot(record)
    setNewSupplier({ name: '', email: '', category: '' })
  }

  async function generateLotPdf() {
    if (!submission.pdfData) return
    setPdfBusy(true)
    try {
      const bytes = await extractLotPdf(submission.pdfData, lot.pages)
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${lot.cfcCode}-${lot.chapterCode}${lot.subChapterCode ? '-' + lot.subChapterCode : ''}-p${lot.pages[0]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfBusy(false)
    }
  }

  function generateEmail() {
    const subject = `Demande de prix — ${lot.title}${submission.info.projectName ? ' — ' + submission.info.projectName : ''}`
    const deadlineTxt = submission.info.deadline
      ? new Date(submission.info.deadline).toLocaleDateString('fr-CH')
      : '[date limite]'
    const body = [
      `DATE DE REPONSE SOUHAITEE : ${deadlineTxt}`,
      '',
      'Bonjour,',
      '',
      `Merci de bien vouloir nous transmettre votre offre pour les prestations décrites selon soumission ci-annexée (${lot.prestationType === 'fourniture' ? 'fourniture uniquement' : 'fourniture et pose'}).`,
      '',
      "N'hésitez pas à chiffrer l'ensemble des positions qui vous intéressent et à proposer des variantes qui vous semblent pertinentes.",
      '',
      `Plans : ${submission.info.projectName || '[Nom du projet]'} - ${submission.info.siteLocation || '[Ville]'}`,
      '',
      'MERCI DE MENTIONNER LES REFERENCES SUIVANTES SUR VOTRE MAIL DE RETOUR :',
      `${submission.info.siteNumber || '[N° de chantier]'} - ${submission.info.projectName || '[Nom du projet]'} - ${submission.info.siteLocation || '[Ville]'}`,
      '',
      `Calculateur : ${submission.info.calculatorName || '[Nom]'} — ${submission.info.calculatorEmail || ''} — ${submission.info.calculatorPhone || ''}`,
    ].join('\n')

    const followUp = lot.suppliers.map((s) => {
      const existing = lot.followUp.find((f) => f.supplierId === s.supplierId)
      return (
        existing ?? {
          supplierId: s.supplierId,
          name: s.name,
          email: s.email,
          status: 'a_envoyer' as const,
          conforme: true,
          retained: false,
        }
      )
    })

    onChange({
      emailSubject: subject,
      emailBody: body,
      emailGeneratedAt: new Date().toISOString(),
      followUp,
    })
    setEmailGenerated(true)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  function markAllSent() {
    const today = new Date().toISOString().slice(0, 10)
    onChange({
      followUp: lot.followUp.map((f) => ({ ...f, status: 'envoye' as const, sentDate: f.sentDate ?? today })),
    })
  }

  const bccList = lot.suppliers.map((s) => s.email).filter(Boolean)
  const missingEmail = lot.suppliers.filter((s) => !s.email)

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-start justify-between">
          <div className="grid grid-cols-3 gap-4 flex-1">
            <Field label="Titre du lot">
              <input className="input" value={lot.title} onChange={(e) => onChange({ title: e.target.value })} />
            </Field>
            <Field label="Référence CFC">
              <input className="input" value={lot.cfcCode} onChange={(e) => onChange({ cfcCode: e.target.value })} />
            </Field>
            <Field label="Type de prestation">
              <select
                className="input"
                value={lot.prestationType}
                onChange={(e) => onChange({ prestationType: e.target.value as PrestationType })}
              >
                <option value="fourniture">Fourniture</option>
                <option value="fourniture_pose">Fourniture et pose</option>
              </select>
            </Field>
          </div>
          <button title="Prévisualiser le PDF du lot" className="text-2xl ml-4 text-slate-400 hover:text-indigo-600" onClick={onPreview}>
            🔍
          </button>
        </div>
        <p className="text-sm text-slate-500 mt-3">
          Chapitre {lot.chapterCode || '—'} {lot.chapterTitle}
          {lot.subChapterCode ? ` · Sous-chapitre ${lot.subChapterCode} ${lot.subChapterTitle}` : ''} · Pages{' '}
          {lot.pages.join(', ')} · {lot.positionCount} position(s)
        </p>
        <div className="flex gap-2 mt-4">
          <button className="btn-primary" onClick={() => onChange({ validated: true })} disabled={lot.validated}>
            ✅ Valider ce lot
          </button>
          <button className="btn-danger" onClick={onDelete}>
            🗑 Supprimer ce lot
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-1">Catégories sourcing</h3>
        <p className="text-sm text-slate-500 mb-3">
          Proposées automatiquement à partir du titre du lot — corrigez au besoin, elles servent à matcher les
          fournisseurs de votre base.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {lot.categories.map((c) => (
            <span key={c} className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm flex items-center gap-1.5">
              {c}
              <button onClick={() => removeCategory(c)} className="text-indigo-400 hover:text-indigo-700">
                ✕
              </button>
            </span>
          ))}
          {lot.categories.length === 0 && <span className="text-sm text-slate-400">Aucune catégorie proposée.</span>}
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            list="all-categories"
            placeholder="Rechercher une catégorie à ajouter..."
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          />
          <button className="btn-secondary whitespace-nowrap" onClick={addCategory}>
            + Ajouter la catégorie
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-3">Fournisseurs pour ce lot</h3>

        {activeMatches.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-slate-500 mb-2">Suggérés depuis votre base (par catégorie) :</p>
            <div className="space-y-1.5">
              {activeMatches.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm bg-slate-50 rounded px-3 py-1.5">
                  <span>
                    <strong>{s.name}</strong> · {s.category}
                    {s.nature ? ` · ${s.nature}` : ''} · {s.email || "pas d'e-mail enregistré"}
                    {s.zone ? ` · ${s.zone}` : ''}
                  </span>
                  <button
                    className="btn-secondary !py-1"
                    onClick={() => addSupplierToLot(s)}
                    disabled={lot.suppliers.some((x) => x.supplierId === s.id)}
                  >
                    {lot.suppliers.some((x) => x.supplierId === s.id) ? 'Ajouté' : 'Ajouter'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {inactiveMatches.length > 0 && (
          <details className="mb-4">
            <summary className="cursor-pointer text-sm text-slate-400">
              {inactiveMatches.length} fournisseur(s) de cette catégorie marqué(s) inactif / à ne pas consulter
            </summary>
            <div className="space-y-1.5 mt-2">
              {inactiveMatches.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm bg-slate-50 rounded px-3 py-1.5 opacity-60">
                  <span>
                    <strong>{s.name}</strong> · {s.status}
                  </span>
                  <button className="btn-secondary !py-1" onClick={() => addSupplierToLot(s)}>
                    Ajouter quand même
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}

        <p className="text-sm text-slate-500 mb-2">Fournisseurs retenus pour ce lot :</p>
        {lot.suppliers.length === 0 ? (
          <p className="text-sm text-slate-400 mb-3">Aucun fournisseur retenu.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-3">
            {lot.suppliers.map((s) => (
              <span key={s.supplierId} className="px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-sm flex items-center gap-1.5">
                {s.name} {s.email ? `(${s.email})` : '⚠ sans e-mail'}
                <button onClick={() => removeSupplierFromLot(s.supplierId)} className="text-green-500 hover:text-green-800">
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-indigo-600">+ Ajouter un nouveau fournisseur à la base</summary>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <input
              className="input"
              placeholder="Nom du fournisseur"
              value={newSupplier.name}
              onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
            />
            <input
              className="input"
              placeholder="Email"
              value={newSupplier.email}
              onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
            />
            <input
              className="input"
              list="all-categories"
              placeholder="Catégorie"
              value={newSupplier.category}
              onChange={(e) => setNewSupplier({ ...newSupplier, category: e.target.value })}
            />
          </div>
          <button className="btn-secondary mt-2" onClick={createAndAddSupplier}>
            + Ajouter à la base et au lot
          </button>
        </details>
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-3">Générer la demande</h3>
        <div className="flex gap-2 mb-3">
          <button className="btn-secondary" onClick={generateLotPdf} disabled={!submission.pdfData || pdfBusy}>
            📄 {pdfBusy ? 'Génération...' : "Générer le PDF du lot (pages d'origine)"}
          </button>
          <button className="btn-primary" onClick={generateEmail} disabled={lot.suppliers.length === 0}>
            ✉️ Générer l'e-mail groupé pour ce lot
          </button>
        </div>
        <p className="text-sm text-slate-500">
          Un seul e-mail est créé par lot, avec tous les fournisseurs retenus en copie cachée (Cci) afin qu'ils ne
          se voient pas entre eux.
        </p>

        {missingEmail.length > 0 && (
          <p className="text-sm text-amber-600 mt-2">
            ⚠ Pas d'adresse enregistrée pour : {missingEmail.map((s) => s.name).join(', ')}.
          </p>
        )}

        {emailGenerated && lot.emailBody && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <h4 className="font-medium text-slate-800 mb-2">
              E-mail groupé — {lot.suppliers.length} fournisseur(s) en copie cachée (Cci)
            </h4>
            <Field label="Destinataires (Cci, séparés par des virgules)">
              <input className="input" readOnly value={bccList.join(', ')} />
            </Field>
            <Field label="Objet">
              <input
                className="input mt-2"
                value={lot.emailSubject}
                onChange={(e) => onChange({ emailSubject: e.target.value })}
              />
            </Field>
            <label className="label mt-2">Corps du message</label>
            <textarea
              className="input h-48 font-mono text-xs"
              value={lot.emailBody}
              onChange={(e) => onChange({ emailBody: e.target.value })}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <a
                className="btn-primary"
                href={`mailto:?bcc=${encodeURIComponent(bccList.join(','))}&subject=${encodeURIComponent(
                  lot.emailSubject ?? '',
                )}&body=${encodeURIComponent(lot.emailBody ?? '')}`}
              >
                ✉️ Ouvrir dans ma messagerie
              </a>
              <button
                className="btn-secondary"
                onClick={() =>
                  copyToClipboard(`À (Cci): ${bccList.join(', ')}\nObjet: ${lot.emailSubject}\n\n${lot.emailBody}`)
                }
              >
                Copier objet + destinataires + corps
              </button>
              <button className="btn-secondary" onClick={() => copyToClipboard(lot.emailBody ?? '')}>
                Copier le corps seul
              </button>
              <button className="btn-secondary" onClick={markAllSent}>
                ✅ Marquer tout "Envoyé" dans le suivi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}
