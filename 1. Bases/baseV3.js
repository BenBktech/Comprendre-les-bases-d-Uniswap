/*
UniswapV3 a été développé afin d'améliorer la V2.
Uniswap V2 est une bourse générale qui met en œuvre un 
algorithme AMM. Cependant, toutes les paires d'échange 
ne sont pas égales. Les paires peuvent être regroupées 
en fonction de la volatilité des prix :
- Les jetons dont la volatilité des prix est moyenne ou élevée. 
Ce groupe comprend la plupart des jetons, car leur prix n'est pas 
indexé sur quelque chose et est soumis aux fluctuations du marché.
- Les jetons à faible volatilité. Ce groupe comprend les jetons dont 
le prix est fixé, principalement les stablecoins : 
USDC/USDT, USDC/DAI, USDT/DAI, etc. 
Également : ETH/stETH, ETH/rETH (variantes de l'ETH enveloppé)

Ces groupes nécessitent des configurations de pool différentes. 
La principale différence réside dans le fait que les jetons ancrés 
nécessitent une liquidité élevée afin de réduire l'effet de demande sur 
les transactions importantes. Les prix de l'USDC et de l'USDT doivent 
rester proches de 1, quel que soit le nombre de tokens que nous voulons 
acheter et vendre. L'algorithme AMM général d'Uniswap V2 n'étant pas très 
bien adapté aux échanges de stablecoins, les AMM alternatifs (principalement Curve)
ont été plus populaires pour les échanges de stablecoins.

Ce problème est dû au fait que la liquidité des pools d'Uniswap V2 est 
distribuée à l'infini - la liquidité du pool permet des transactions 
à n'importe quel prix, de 0 à l'infini.

Cela ne semble pas être une mauvaise chose, mais cela rend le capital 
inefficace. Les prix historiques d'un actif restent dans une fourchette 
définie, qu'elle soit étroite ou large. Par exemple, la fourchette 
de prix historique de l'ETH est comprise entre 0,75 et 4 800 (selon CoinMarketCap). 
Aujourd'hui (février 2024, 1 ETH coûte 2 487 $), personne n'achèterait
1 éther à 5 000 $, il est donc absurde de fournir de la liquidité à ce prix. 
Il n'est donc pas judicieux de fournir des liquidités dans une fourchette de 
prix qui est très éloignée du prix actuel ou qui ne sera jamais atteinte.

Uniswap V3 introduit la liquidité concentrée : les fournisseurs de liquidité 
peuvent désormais choisir la fourchette de prix dans laquelle ils souhaitent 
fournir de la liquidité. Cela améliore l'efficacité du capital en permettant 
de placer plus de liquidités dans une fourchette de prix étroite, ce qui rend
Uniswap plus diversifié : il peut maintenant avoir des pools configurés pour des 
paires ayant une volatilité différente. C'est ainsi que la V3 améliore la V2.

En résumé, une paire Uniswap V3 est constituée de plusieurs petites paires Uniswap V2.
La principale différence entre V2 et V3 est que, dans V3, il y a plusieurs fourchettes 
de prix dans une paire. Et chacune de ces fourchettes de prix plus courtes a des 
réserves finies. L'ensemble de la fourchette de prix allant de 0 à l'infini est divisé 
en fourchettes de prix plus courtes, chacune d'entre elles ayant sa propre quantité 
de liquidités. Mais ce qui est crucial, c'est qu'à l'intérieur de cette fourchette 
de prix plus courte, le système fonctionne exactement comme l'Uniswap V2. 
C'est pourquoi je dis qu'une paire V3 est constituée de plusieurs petites paires V2.

https://defi-lab.xyz/uniswapv3simulator
*/

// Pour gérer la transition entre les fourchettes de prix, 
// simplifier la gestion des liquidités et éviter les erreurs d'arrondi, 
// Uniswap V3 utilise ces nouveaux concepts :

// let L = Math.sqrt(montantTokenX * montantTokenY)
// let P;
// Math.sqrt(P) = Math.sqrt(y / x)


/* Moyenne géométrique (√xy): C'est une sorte de moyenne entre les quantités de deux tokens dans le pool.
Si on multiplie cette moyenne par elle-même, on obtient le produit des deux réserves, 
qui est k. Cela aide à comprendre la relation entre les tokens dans le pool. 

Price (√P): Le prix d'un token en termes d'un autre token. Uniswap V3 utilise la 
racine carrée du prix (√P) pour simplifier les calculs. Si nous avons deux tokens, 
A et B, et que le prix de A en termes de B est de 2, alors √P serait la 
racine carrée de 2.

Pourquoi utiliser √P au lieu de P ?: Il y a deux raisons principales. 
Premièrement, calculer des racines carrées directement sur la blockchain peut 
causer des erreurs d'arrondi. Deuxièmement, utiliser √P simplifie les formules 
et les calculs sur la plateforme.

Changement de ∆y / ∆√P: Cela montre comment la quantité de tokens échangés 
change en fonction du changement de prix. C'est un peu comme dire 
"si le prix d'un token augmente ou diminue, voici comment cela affecte la 
quantité de ce token que vous pouvez obtenir".

L = (Δy) / (Δ√P)

Là encore, nous n'avons pas besoin de calculer les prix réels - nous pouvons calculer
immédiatement le montant de la production. De plus, comme nous n'allons pas suivre 
et stocker x et y, notre calcul sera basé uniquement sur L et √P

La formule ci-dessus nous permet de trouver Δy : Δy = Δ√PL

Comme nous l'avons vu plus haut, les prix dans un pool sont réciproques. 
Ainsi, Δx est : Δ(1 / √P)L

L et √P nous permettent de ne pas stocker et mettre à jour les réserves du pool. 
De plus, nous n'avons pas besoin de calculer √P à chaque fois, car nous pouvons 
toujours trouver Δ√P et sa réciproque.
*/

let montantTokenX = 400;
let montantTokenY = 10;
let deltaY = 2; // Changement donné pour le token Y

// Calcul de la liquidité L initiale
let L = Math.sqrt(montantTokenX * montantTokenY); // Racine carrée de K

// Le nouveau montant de Y après le changement deltaY
let newY = montantTokenY + deltaY;

// Pour maintenir la constance du produit K, calculons le nouveau montant de X
// K = montantTokenX * montantTokenY = newX * newY
let K = montantTokenX * montantTokenY;
let newX = K / newY;

// La variation de la quantité du token X (Delta x) est la différence entre l'ancien X et le nouveau X
let deltaX = montantTokenX - newX;

// Calcul des prix avant et après le trade
let prixAvant = montantTokenY / montantTokenX;
let prixAprès = newY / newX;

console.log("Le nouveau montant de Token X après le trade est:", newX);
console.log("La variation de la quantité du token X (Delta x) est:", deltaX);
console.log("Le prix avant le trade (Token Y par Token X) est:", prixAvant);
console.log("Le prix après le trade (Token Y par Token X) est:", prixAprès);

/* TICKS 
Dans Uniswap V3, plutôt que d'avoir un continuum de prix possibles, les prix sont 
divisés en ce qu'on appelle des "ticks". Chaque tick est un point de prix discret 
et chaque tick a un indice qui correspond à un certain prix.

La formule donnée pour le prix à un tick i est :
p(i)=1.0001^i (comprendre : exposant i)

Où p(i) est le prix au tick i. Chaque augmentation d'un tick index signifie 
que le prix est multiplié par 1.0001. Cela a une propriété 
intéressante : la différence de prix entre deux ticks adjacents est d'environ 0.01%, 
ou un "basis point". Un "basis point" est un terme financier qui signifie 1/100ème de 1
pour cent, ou 0.0001.

Uniswap V3 ne stocke pas directement le prix P, mais la racine carrée du prix √P. 
Cela simplifie les calculs et réduit les erreurs potentielles. 
Ainsi, la formule pour le prix devient :

√(p(i)) = √(1.0001^i) = 1.0001^(i/2)

Cela signifie que si i = 0, alors √(p(0)) = 1, ce qui a du sens car multiplier 
quelque chose par 1 ne change pas sa valeur. Si i = 1, alors √(p(1)) est légèrement 
plus grand que 1 (environ 1.00005), et si i = −1, alors √(p(-1)) est légèrement 
inférieur à 1 (environ 0.99995).
*/