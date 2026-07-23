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
        <li><strong>Jaune</strong> (R et G élevés, B faible, ex. 255/255/0) → Demande de prix fourniture uniquement</li>
        <li><strong>Toute autre couleur</strong> (ex. orange 255/173/91) → Demande de prix fourniture et pose</li>
      </ul>

      <h4 className="font-semibold text-slate-700 mt-4">2. Trois niveaux de hiérarchie CAN</h4>
      <p className="text-sm text-slate-600">
        Chaque page répète un bandeau « CAN Construction : &lt;code&gt; &lt;titre&gt; » — un changement de code
        entre deux pages marque un nouveau <strong>chapitre CAN</strong>. À l'intérieur d'un chapitre, deux niveaux
        de titres se distinguent :
      </p>
      <ul className="text-sm text-slate-600 list-disc pl-5">
        <li>
          <strong>Chapitre</strong> : un titre en colonne de gauche suivi d'un filet en pointillé (ex. « 440
          Incorporés, bandes d'appui »).
        </li>
        <li>
          <strong>Sous-chapitre</strong> : un titre sans filet, qui introduit directement des articles chiffrés
          (ex. « 442 Matériau isolant dans coffrages de dalles » → « .001 ... »).
        </li>
      </ul>

      <h4 className="font-semibold text-slate-700 mt-4">3. Règles de constitution des lots</h4>
      <ul className="text-sm text-slate-600 list-disc pl-5">
        <li>
          Si le surlignage porte sur un <strong>article précis</strong>, il est rattaché au sous-chapitre (et au
          chapitre) actifs à cet endroit du document.
        </li>
        <li>
          Si plusieurs articles surlignés appartiennent au <strong>même sous-chapitre</strong> — même sur des
          pages différentes — ils sont automatiquement <strong>regroupés en un seul lot</strong>. Un sous-chapitre
          différent, ou une couleur différente (fourniture vs fourniture et pose), donne un lot distinct.
        </li>
        <li>
          Si le surlignage porte sur le <strong>titre d'une section</strong> (chapitre, sous-chapitre, ou chapitre
          CAN entier) sans article précis dessous, l'outil considère que <strong>tout le contenu de cette
          section</strong> doit être consulté, et étend le lot jusqu'à la section suivante de même niveau (ou la
          fin du chapitre).
        </li>
      </ul>
      <p className="text-sm text-slate-600">
        Le titre du lot combine le chapitre et le sous-chapitre identifiés (ex. « 440 Incorporés, bandes d'appui —
        442 Matériau isolant dans coffrages de dalles »), et reste entièrement modifiable dans l'onglet 2. Vous
        pouvez aussi cocher plusieurs lots proposés puis « Fusionner » si des articles distincts doivent en fait
        être sourcés ensemble.
      </p>

      <h4 className="font-semibold text-slate-700 mt-4">4. Suggestion de catégories et de fournisseurs</h4>
      <p className="text-sm text-slate-600">
        À la création de chaque lot, l'outil compare son titre à la liste des catégories de votre base fournisseurs
        et propose automatiquement les catégories les plus probables. Les fournisseurs de ces catégories sont
        ensuite suggérés dans l'onglet 2 — il ne reste qu'à cliquer sur « Ajouter » pour les retenir.
      </p>

      <h4 className="font-semibold text-slate-700 mt-4">Limites connues</h4>
      <ul className="text-sm text-slate-600 list-disc pl-5">
        <li>
          Le titre et les catégories automatiques restent des propositions — corrigez-les librement dans l'onglet 2.
        </li>
        <li>Un PDF sans surlignage natif (image scannée, aplats dessinés) ne sera pas détecté automatiquement.</li>
        <li>
          Il arrive qu'un même contenu apparaisse en double (un lot « section entière » qui recouvre un lot «
          article précis » situé dans la même section) si le document contient deux annotations distinctes pour la
          même zone — supprimez ou fusionnez le doublon si besoin.
        </li>
        <li>
          Une continuation d'article en haut de page (après « A reporter ») est ignorée pour éviter les faux
          positifs, sauf cas rares où elle démarre par un mot capitalisé.
        </li>
      </ul>
    </div>
  )
}
