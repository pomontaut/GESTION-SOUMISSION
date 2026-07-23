export default function AnnexeTab() {
  return (
    <div className="card prose max-w-none">
      <h3 className="font-semibold text-slate-800 text-lg mb-3">Méthode de détection des lots</h3>

      <h4 className="font-semibold text-slate-700 mt-4">1. Repérage des surlignages</h4>
      <p className="text-sm text-slate-600">
        Les PDF de soumission (générés par les logiciels de type CAN) contiennent les zones à sourcer sous forme
        d'<strong>annotations de surlignage natives du PDF</strong> (et non de simples aplats de couleur dessinés
        sur la page). L'outil lit directement ces annotations — leur couleur exacte (RGB) et leur position — ce
        qui rend la détection fiable et déterministe, sans reconnaissance d'image.
      </p>
      <ul className="text-sm text-slate-600 list-disc pl-5">
        <li><strong>Jaune</strong> (R et G élevés, B faible, ex. 255/255/0) → Fourniture uniquement</li>
        <li><strong>Toute autre couleur</strong> (ex. orange 255/173/91) → Fourniture et pose</li>
      </ul>

      <h4 className="font-semibold text-slate-700 mt-4">2. Rattachement à un sous-chapitre</h4>
      <p className="text-sm text-slate-600">
        Chaque page répète un bandeau « CAN Construction : &lt;code&gt; &lt;titre&gt; ». Un changement de code
        entre deux pages marque le début d'un nouveau chapitre CAN. À l'intérieur d'un chapitre, les titres de
        section sont imprimés en colonne de gauche sous la forme « &lt;numéro&gt; &lt;Titre&gt; ». L'outil retient
        le titre le plus proche qui précède chaque zone surlignée pour nommer le lot correspondant.
      </p>

      <h4 className="font-semibold text-slate-700 mt-4">3. Lots « chapitre entier »</h4>
      <p className="text-sm text-slate-600">
        Si le surlignage porte sur le titre du chapitre lui-même (et non sur un article), l'outil considère que
        l'ensemble du chapitre constitue un seul lot (cas typique des lots confiés à un spécialiste unique, par
        exemple précontrainte ou éléments préfabriqués) et étend le lot à toutes les pages de ce chapitre.
      </p>

      <h4 className="font-semibold text-slate-700 mt-4">4. Regroupement en lots proposés</h4>
      <p className="text-sm text-slate-600">
        Par défaut, l'outil propose un lot par page et par couleur de surlignage sous un même sous-chapitre. Cela
        correspond en général à un article ou groupe d'articles homogène. Si plusieurs pages doivent en réalité
        être sourcées ensemble, cochez les lots concernés dans l'onglet « Lots & e-mails » et cliquez sur
        « Fusionner ».
      </p>

      <h4 className="font-semibold text-slate-700 mt-4">Limites connues</h4>
      <ul className="text-sm text-slate-600 list-disc pl-5">
        <li>
          Le titre automatique du lot peut parfois pointer vers un en-tête voisin plutôt que le plus précis — il
          reste entièrement modifiable dans l'onglet 2.
        </li>
        <li>Un PDF sans surlignage natif (image scannée, aplats dessinés) ne sera pas détecté automatiquement.</li>
        <li>
          Une continuation d'article en haut de page (après « A reporter ») est ignorée pour éviter les faux
          positifs, sauf cas rares où elle démarre par un mot capitalisé.
        </li>
      </ul>
    </div>
  )
}
