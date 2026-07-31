# Suivi des remboursements élèves

## Objet

La tuile `Remboursements élèves` suit les sommes avancées par le club pour une
compétition ou un stage. Elle est réservée aux comptes staff auxquels la tuile
`remboursements_eleves` a été attribuée.

Le module est hors saison : une demande reste ouverte jusqu'à son règlement ou
son annulation, puis elle est conservée dans les archives. Le sélecteur de
saison n'est pas affiché sur cette route.

## Créer une demande

Une demande définit :

- le formulaire HelloAsso concerné : compétition ou stage ;
- un libellé, une date et une description facultatives ;
- les élèves concernés, sélectionnés dans le snapshot courant des élèves en
  cours ;
- soit un montant total réparti exactement entre les bénéficiaires, soit un
  prix fixe par personne.

Les montants sont enregistrés en centimes. Pour un total non divisible, les
centimes restants sont répartis dans un ordre stable. Chaque bénéficiaire
conserve son nom, prénom, email, licence, cours et horaire au moment de la
création afin que l'historique survive aux renouvellements du snapshot externe.

## Demander et relancer

Les boutons `Email initial` et `Relance` ouvrent un brouillon Gmail dans un
nouvel onglet avec le compte `escalade@caflarochebonneville.fr`. Le destinataire,
l'objet, le montant et le lien HelloAsso sont préremplis.

L'application journalise uniquement la préparation du brouillon. Elle ne peut
pas savoir si l'utilisateur a ensuite cliqué sur `Envoyer` dans Gmail ; le suivi
affiche donc explicitement « brouillon préparé » et invite à vérifier l'envoi
dans Gmail.

Les formulaires sont fixes :

- compétition :
  `https://www.helloasso.com/associations/caf-la-roche-bonneville/paiements/esc07-remboursement-inscriptions-competition` ;
- stage :
  `https://www.helloasso.com/associations/caf-la-roche-bonneville/paiements/esc11-remboursement-stage`.

## Rapprocher les paiements

À l'ouverture de la tuile, le cache HelloAsso dédié est actualisé au plus une
fois par heure. Les paiements autorisés et non encore utilisés sont proposés
pour le bénéficiaire sélectionné. Une suggestion explique ses indices : email,
nom et montant restant.

Une suggestion n'est jamais validée automatiquement. L'utilisateur sélectionne
le paiement puis clique sur `Valider le rapprochement`. Plusieurs paiements
partiels peuvent solder un bénéficiaire, mais un paiement qui dépasse le reste
dû est refusé et un même paiement ne peut être relié qu'à un seul élève.

Un remboursement partiel HelloAsso réduit le montant encaissé. Un remboursement
total retire le paiement du solde et son statut reste visible dans l'historique.

## Archives et annulations

Une demande réglée peut être archivée lorsque tous ses bénéficiaires sont
soldés. Une demande erronée ou abandonnée peut être annulée avec un motif ; elle
rejoint aussi les archives avec le badge `Annulée`. Toute archive peut être
restaurée.

Les listes actives et archivées sont paginées. Le cache conserve les paiements
HelloAsso non rapprochés pendant 24 mois. Un paiement ancien déjà rapproché
reste conservé pour que l'archive demeure vérifiable.

## Limite métier actuelle

Un paiement HelloAsso est relié à un seul bénéficiaire. Si les formulaires
autorisent une transaction familiale couvrant plusieurs enfants, une évolution
devra permettre de ventiler explicitement son montant entre plusieurs
bénéficiaires.
