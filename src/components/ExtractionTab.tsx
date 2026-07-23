import { useRef, useState } from 'react'
import type { Submission, SubmissionInfo } from '../types'
import { analyzeSubmissionPdf } from '../pdf/analyze'

const ENTITIES = ['INDUNI & CIE', 'INDUNI Genève', 'INDUNI Vaud', 'Autre']

export default function ExtractionTab({
  submission,
  onUpdate,
}: {
  submission: Submission
  onUpdate: (s: Submission) => void
}) {
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function updateInfo(patch: Partial<SubmissionInfo>) {
    onUpdate({ ...submission, info: { ...submission.info, ...patch } })
  }

  async function handleFile(file: File) {
    setError(null)
    setAnalyzing(true)
    try {
      const buffer = await file.arrayBuffer()
      const result = await analyzeSubmissionPdf(buffer)
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
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function resetAll() {
    if (!confirm('Réinitialiser toutes les infos, le PDF, les zones et les lots de cette soumission ?')) return
    onUpdate({
      ...submission,
      info: { ...submission.info },
      pdfFileName: undefined,
      pdfData: undefined,
      zones: [],
      lots: [],
    })
  }

  const zonesByColor = {
    jaune: submission.zones.filter((z) => z.color === 'jaune').length,
    autre: submission.zones.filter((z) => z.color === 'autre').length,
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-1">Informations de la soumission</h3>
        <p className="text-sm text-slate-500 mb-4">
          Ces informations apparaissent sur le dashboard de suivi (onglet 3) et dans les e-mails.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Nom du projet / soumission">
            <input
              className="input"
              value={submission.info.projectName}
              onChange={(e) => updateInfo({ projectName: e.target.value })}
            />
          </Field>
          <Field label="Numéro de soumission">
            <input
              className="input"
              value={submission.info.submissionNumber}
              onChange={(e) => updateInfo({ submissionNumber: e.target.value })}
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
              value={submission.info.entity}
              onChange={(e) => updateInfo({ entity: e.target.value })}
            >
              <option value="">— Choisir —</option>
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nom du demandeur (contact)">
            <input
              className="input"
              placeholder="ex: Jean Dupont"
              value={submission.info.requesterName}
              onChange={(e) => updateInfo({ requesterName: e.target.value })}
            />
          </Field>
          <Field label="Email du demandeur (contact)">
            <input
              className="input"
              placeholder="ex: j.dupont@induni.ch"
              value={submission.info.requesterEmail}
              onChange={(e) => updateInfo({ requesterEmail: e.target.value })}
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
        <h3 className="font-semibold text-slate-800 mb-1">Importer votre soumission (PDF)</h3>
        <p className="text-sm text-slate-500 mb-4">
          Le fichier reste local à votre navigateur. L'outil détecte les zones surlignées (jaune = fourniture
          uniquement, toute autre couleur = fourniture et pose) et les regroupe par sous-chapitre pour créer des
          lots.
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
              ? 'Analyse en cours…'
              : submission.pdfFileName
                ? `Fichier: ${submission.pdfFileName}`
                : 'Aucun fichier sélectionné'}
          </p>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <button className="btn-danger mt-4" onClick={resetAll}>
          ⟲ Réinitialiser tout (infos, PDF, zones, lots et suivi)
        </button>
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-1">Zones détectées</h3>
        <p className="text-sm text-slate-500 mb-4">
          Les lots sont créés automatiquement par zone surlignée (onglet 2). Ajustez le titre, le type de
          prestation ou fusionnez plusieurs lots directement dans l'onglet suivant.
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
