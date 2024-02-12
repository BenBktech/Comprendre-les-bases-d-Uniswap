# Les bases des contrats Uniswap V3

## UniswapV3Pool

- Il s'agit du contrat principal où les échanges de tokens ont lieu.
- Chaque pool est un marché pour un couple de tokens donné.
- Le contrat gère la liquidité fournie par les utilisateurs et les prix selon la formule x * y = k, avec des améliorations pour permettre une gestion de liquidité concentrée et des frais dynamiques.

## UniswapV3Factory

- C'est un contrat qui sert de "fabricant" pour les pools Uniswap V3.
- Il permet de créer de nouveaux pools pour n'importe quelle paire de tokens ERC-20.
- Ce contrat maintient un registre de toutes les pools existantes et s'assure qu'il n'y a qu'une seule pool par paire de tokens avec un taux de frais spécifique.

## UniswapV3Manager 

- Ce contrat permet aux utilisateurs de gérer leurs positions de liquidité, qui sont représentées comme des jetons non fongibles (NFTs) dans V3, à la différence des versions précédentes où la liquidité était fongible.
- Chaque position NFT est unique et représente une fourchette de prix spécifique dans une pool de liquidité donnée.
- Les utilisateurs peuvent ajouter ou retirer de la liquidité, et ajuster leurs plages de prix à travers ce contrat.

## UniswapV3Quoter

- Ce contrat est utilisé pour obtenir des estimations de prix sans exécuter réellement un trade.
- Il est utile pour les interfaces utilisateur et les autres contrats qui ont besoin de connaître le prix auquel un trade serait exécuté sans affecter l'état de la pool.