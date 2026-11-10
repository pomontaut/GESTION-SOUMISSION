import { useRef, useState } from 'react'
import type { PlanAttachment, Submission, SubmissionInfo } from '../types'
import { uid } from '../types'
import { ENTITY_OPTIONS, KNOWN_CALCULATORS } from '../types'
import { analyzeSubmissionPdf, pdfHasExtractableText } from '../pdf/analyze'
import { analyzeSubmissionPdfOcr } from '../pdf/analyzeOcr'

const CALCULATOR_CUSTOM = '__custom__'

export default function ExtractionTab({
  submission,
  onUpdate,
}: {
  submission: Submission
  onUpdate: (s: Submission) => void
}) {
  const [analyzing, setAnalyzing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState<{ page: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [entityCustom, setEntityCustom] = useState(!submission.info.entity || !ENTITY_OPTIONS.includes(submission.info.entity))
  const [calculatorCustom, setCalculatorCustom] = useState(
    !submission.info.calculatorName || !KNOWN_CALCULATORS.some((c) => c.name === submission.info.calculatorName),
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const plansInputRef = useRef<HTMLInputElement>(null)

  function updateInfo(patch: Partial<SubmissionInfo>) {
    onUpdate({ ...submission, info: { ...submission.info, ...patch } })
  }

  function handleEntitySelect(value: string) {
    if (value === CALCULATOR_CUSTOM) {
      setEntityCustom(true)
      updateInfo({ entity: '' })
    } else {
      setEntityCustom(false)
      updateInfo({ entity: value })
    }
  }

  function handleCalculatorSelect(value: string) {
    if (value === CALCULATOR_CUSTOM) {
      setCalculatorCustom(true)
      updateInfo({ calculatorName: '', calculatorEmail: '', calculatorPhone: '' })
      return
    }
    setCalculatorCustom(false)
    const found = KNOWN_CALCULATORS.find((c) => c.name === value)
    if (found) {
      updateInfo({ calculatorName: found.name, calculatorEmail: found.email, calculatorPhone: found.phone })
    }
  }

  async function handleFile(file: File) {
    setError(null)
    setAnalyzing(true)
    setOcrProgress(null)
    try {
      const buffer = await file.arrayBuffer()
      const hasText = await pdfHasExtractableText(buffer)
      const result = hasText
        ? await analyzeSubmissionPdf(buffer)
        : await analyzeSubmissionPdfOcr(buffer, (page, total) => setOcrProgress({ page, total }))
      onUpdate({
        ...submission,
        name: submission.info.projectName || file.name.replace(/\.pdf$/i, ''),
        pdfFileName: file.name,
        pdfData: buffer,
        zones: result.zones,
        lots: result.lots,
      })
    } catch (err) {
      console.error(err)
      setError(
        "Impossible d'analyser ce PDF. Vérifiez qu'il s'agit bien d'un PDF de soumission avec des surlignages (voir l'onglet Annexe).",
      )
    } finally {
      setAnalyzing(false)
      setOcrProgress(null)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function addPlans(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    const added: PlanAttachment[] = []
    for (const f of list) {
      added.push({ id: uid(), name: f.name, mime: f.type || 'application/octet-stream', size: f.size, data: await f.arrayBuffer() })
    }
    onUpdate({ ...submission, plans: [...(submission.plans ?? []), ...added] })
  }

  function removePlan(id: string) {
    onUpdate({ ...submission, plans: (submission.plans ?? []).filter((p) => p.id !== id) })
  }

  function downloadPlan(p: PlanAttachment) {
    const url = URL.createObjectURL(new Blob([p.data], { type: p.mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = p.name
    a.click()
    URL.revokeObjectURL(url)
  }

  function resetAll() {
    if (!confirm('Réinitialiser le PDF, les zones et les lots de cette soumission ? Les informations de chantier sont conservées.')) return
    onUpdate({ ...submission, pdfFileName: undefined, pdfData: undefined, zones: [], lots: [] })
  }

  const zonesByColor = {
    jaune: submission.zones.filter((z) => z.color === 'jaune').length,
    autre: submission.zones.filter((z) => z.color === 'autre').length,
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-1">Informations du chantier</h3>
        <p className="text-sm text-slate-500 mb-4">
          Ces informations apparaissent sur le dashboard de suivi (onglet 3) et dans les e-mails.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="N° de chantier">
            <input
              className="input"
              value={submission.info.siteNumber}
              onChange={(e) => updateInfo({ siteNumber: e.target.value })}
            />
          </Field>
          <Field label="Nom du chantier">
            <input
              className="input"
              value={submission.info.projectName}
              onChange={(e) => updateInfo({ projectName: e.target.value })}
            />
          </Field>
          <Field label="Lieu du futur chantier">
            <input
              className="input"
              placeholder="ex: Carouge (GE)"
              value={submission.info.siteLocation}
              onChange={(e) => updateInfo({ siteLocation: e.target.value })}
            />
          </Field>
          <Field label="Entité">
            <select
              className="input"
              value={entityCustom ? CALCULATOR_CUSTOM : submission.info.entity}
              onChange={(e) => handleEntitySelect(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {ENTITY_OPTIONS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
              <option value={CALCULATOR_CUSTOM}>Autre (saisie libre)</option>
            </select>
            {entityCustom && (
              <input
                className="input mt-2"
                placeholder="Saisir l'entité"
                value={submission.info.entity}
                onChange={(e) => updateInfo({ entity: e.target.value })}
              />
            )}
          </Field>
          <Field label="Calculateur">
            <select
              className="input"
              value={calculatorCustom ? CALCULATOR_CUSTOM : submission.info.calculatorName}
              onChange={(e) => handleCalculatorSelect(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {KNOWN_CALCULATORS.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
              <option value={CALCULATOR_CUSTOM}>Autre (saisie libre)</option>
            </select>
            {calculatorCustom && (
              <input
                className="input mt-2"
                placeholder="Nom du calculateur"
                value={submission.info.calculatorName}
                onChange={(e) => updateInfo({ calculatorName: e.target.value })}
              />
            )}
          </Field>
          <Field label="Email du calculateur">
            <input
              className="input"
              placeholder="ex: j.dupont@induni.ch"
              value={submission.info.calculatorEmail}
              onChange={(e) => updateInfo({ calculatorEmail: e.target.value })}
            />
          </Field>
          <Field label="Téléphone du calculateur">
            <input
              className="input"
              placeholder="ex: 076 490 58 17"
              value={submission.info.calculatorPhone}
              onChange={(e) => updateInfo({ calculatorPhone: e.target.value })}
            />
          </Field>
          <Field label="Date limite de retour des offres">
            <input
              type="date"
              className="input"
              value={submission.info.deadline}
              onChange={(e) => updateInfo({ deadline: e.target.value })}
            />
          </Field>
          <Field label="Lien vers les documents (OneDrive)">
            <input
              className="input"
              placeholder="https://..."
              value={submission.info.documentsLink}
              onChange={(e) => updateInfo({ documentsLink: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-1">Plans (pièces jointes)</h3>
        <p className="text-sm text-slate-500 mb-4">
          Glissez ici les plans du projet (PDF, DWG, images…). Ils restent locaux à votre navigateur et sont
          enregistrés avec la soumission.
        </p>
        <div
          className="border-2 border-dashed border-emerald-200 rounded-xl p-8 text-center bg-emerald-50/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            addPlans(e.dataTransfer.files)
          }}
        >
          <p className="text-slate-600 mb-3">📐 Glissez-déposez vos plans ici, ou</p>
          <button className="btn-secondary" onClick={() => plansInputRef.current?.click()}>
            Choisir des fichiers
          </button>
          <input
            ref={plansInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addPlans(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        {(submission.plans ?? []).length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {(submission.plans ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="truncate flex-1" title={p.name}>
                  📎 {p.name}
                </span>
                <span className="text-slate-400">{(p.size / 1024 / 1024).toFixed(2)} Mo</span>
                <button className="btn-secondary" onClick={() => downloadPlan(p)}>
                  Télécharger
                </button>
                <button className="btn-danger" onClick={() => removePlan(p.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-1">Importer votre soumission (PDF)</h3>
        <p className="text-sm text-slate-500 mb-4">
          Le fichier reste local à votre navigateur. L'outil détecte les zones surlignées (jaune = fourniture
          uniquement, toute autre couleur = fourniture et pose) et regroupe automatiquement les articles d'un même
          sous-chapitre en un seul lot.
        </p>
        <div
          className="border-2 border-dashed border-indigo-200 rounded-xl p-10 text-center bg-indigo-50/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <p className="text-slate-600 mb-3">📄 Glissez-déposez votre PDF ici, ou</p>
          <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
            Choisir un fichier
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
          <p className="text-sm text-slate-500 mt-3">
            {analyzing
              ? ocrProgress
                ? `Analyse OCR en cours (page ${ocrProgress.page}/${ocrProgress.total})… ce PDF n'a pas de texte ni de surlignage natif exploitable, l'outil relit chaque page par reconnaissance optique - cela peut prendre plusieurs minutes.`
                : 'Analyse en cours…'
              : submission.pdfFileName
                ? `Fichier: ${submission.pdfFileName}`
                : 'Aucun fichier sélectionné'}
          </p>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <button className="btn-danger mt-4" onClick={resetAll}>
          ⟲ Réinitialiser le PDF, les zones et les lots
        </button>
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-1">Zones détectées</h3>
        <p className="text-sm text-slate-500 mb-4">
          Les lots sont créés automatiquement par sous-chapitre (onglet 2). Ajustez le titre, le type de prestation
          ou fusionnez/scindez des lots directement dans l'onglet suivant.
        </p>
        {submission.zones.length === 0 ? (
          <p className="text-slate-500">Aucune zone détectée pour l'instant — importez un PDF ci-dessus.</p>
        ) : (
          <div className="flex gap-4 text-sm">
            <span className="px-3 py-1.5 rounded-full bg-yellow-100 text-yellow-800">
              🟨 {zonesByColor.jaune} zone(s) fourniture
            </span>
            <span className="px-3 py-1.5 rounded-full bg-orange-100 text-orange-800">
              🟧 {zonesByColor.autre} zone(s) fourniture et pose
            </span>
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700">
              {submission.lots.length} lot(s) proposé(s)
            </span>
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
