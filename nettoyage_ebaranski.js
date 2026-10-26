// Retire ebaranski@induni.ch des fiches fournisseurs et des lots (adresses reprises de la base Excel).
// DRY = true : affiche seulement ce qui serait modifié. Mettre false pour appliquer.
(async () => {
  const DRY = true
  const FIX = {
  "mu0w87vv-waklwz": "vid@hbt-isol.com",
  "mv92qyj5-x13yp5": "jpbatibriques@gmail.com",
  "mv92qyj5-hhotc7": "offre@orllati.ch",
  "mv92qyj5-n5qpeo": "vente@ancotech.ch",
  "mv92qyj5-idlcc6": "info@schoeck-schweiz.ch",
  "mu0w87vv-qdav56": "t.baviera@maxfrank.ch",
  "mu0w87vv-ni1hdg": "t.baviera@maxfrank.ch",
  "mv92qyj5-u0vmb1": "demande@bewetec.ch",
  "mu0w87vv-t9b8u2": "info@cap-etancheite.ch",
  "mu0w87vv-d7ala0": "",
  "mu0w87vv-mthjzm": "",
  "mu0w87vv-vh1boc": "a.dubrez@jlb-bpe.com",
  "mu0w87vv-y7avmu": "arnaud.mathe@knauf.com",
  "mu0w87vv-whaglm": "service@zz-ag.ch",
  "mu0w87vv-gvn7tl": "ortensio.vaccaro@knaufinsulation.com",
  "mu0w87vv-jj57a5": "",
  "mu0w87vv-5gm3r9": "elisabeth.luzzi@tfl.ch",
  "mu0w87vv-n8obb4": "",
  "mu0w87vv-kzyhhb": "",
  "mu0w87vv-hnvano": "",
  "mu0w87vv-gd6ir5": "",
  "mu0w87vv-hr4i0v": "sylvain.roche@dietrich-isol.ch",
  "mu0w87vv-xvu5sm": "offres@lcbe.ch",
  "mu0w87vv-8et9iz": "p.lefranc@gasserceramic.ch"
}
  const bad = (e) => /baranski/i.test(e || '') || (e || '').trim().toLowerCase() === 'ebar'
  const sup = await (await fetch('/api/suppliers')).json()
  let nS = 0
  for (const s of sup) {
    if (!bad(s.email)) continue
    nS++
    if (!DRY) await fetch('/api/suppliers/' + s.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, email: FIX[s.id] ?? '' }) })
  }
  const subs = await (await fetch('/api/submissions')).json()
  let nL = 0, nSub = 0
  for (const sub of subs) {
    let touched = false
    for (const lot of sub.lots || []) for (const k of ['suppliers', 'followUp']) for (const f of lot[k] || []) {
      if (bad(f.email)) { f.email = FIX[f.supplierId] ?? ''; nL++; touched = true }
    }
    if (touched) { nSub++; if (!DRY) await fetch('/api/submissions/' + sub.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) }) }
  }
  console.log((DRY ? '[SIMULATION] ' : '') + nS + ' fiches fournisseurs, ' + nL + ' lignes de lots dans ' + nSub + ' soumissions')
})()
