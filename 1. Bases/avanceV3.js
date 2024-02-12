/* Le trading n'est pas possible sans liquidité, et pour effectuer notre premier swap,
nous devons ajouter de la liquidité au contrat de pool. Voici ce qu'il faut savoir 
pour ajouter de la liquidité au contrat de pool :

- Une fourchette de prix. En tant que fournisseur de liquidité, nous voulons fournir
des liquidités dans une fourchette de prix spécifique, et elles ne seront utilisées que
dans cette fourchette.
- Le montant de la liquidité, qui correspond aux montants de deux jetons. Nous devrons
transférer ces montants au contrat de pool.

Rappelons que, dans Uniswap V3, l'ensemble de la fourchette de prix est délimitée 
en ticks : chaque tick correspond à un prix et possède un index. Dans notre 
première mise en œuvre du pool, nous allons acheter de l'ETH pour de l'USDC 
au prix de 5000 $ pour 1 ETH. L'achat d'ETH enlèvera une partie du pool et 
poussera le prix légèrement au-dessus de 5000 $. Nous voulons fournir des 
liquidités dans une fourchette qui inclut ce prix. Et nous voulons être sûrs que 
le prix final restera dans cette fourchette (nous ferons des swaps à fourchettes 
multiples dans une étape ultérieure).

Nous devrons trouver trois ticks :

- Le tick actuel correspondra au prix actuel (5000 USDC pour 1 ETH).
- Les limites inférieure et supérieure de la fourchette de prix dans laquelle 
nous fournissons de la liquidité. Soit un prix inférieur de 4545 $ et un 
prix supérieur de 5500 $.

On sait que :
√P = √(y / x)
*/
let amountETH = 1;
let amountUsdc = 5000;

let tick2 = 4545;
let tick3 = 5500;

let racineCarreePrixTick5000 = Math.sqrt(amountUsdc / amountETH) // 70.71067811865476
let racineCarreePrixTick4545 = Math.sqrt(tick2 / amountETH) // 67.4166151627327
let racineCarreePrixTick5500 = Math.sqrt(tick3 / amountETH) // 74.16198487095663

/* 
Nous pouvons maintenant trouver les ticks correspondants. 
Nous savons que les prix et les ticks sont liés par cette formule :

√(P(i)) = 1.0001^(i/2)

Ainsi, nous pouvons trouver le tic-tac i via :

i = log(√1.0001 * √(P(i)))
*/

function priceToTick(p) {
    return Math.floor(Math.log(p) / Math.log(1.0001));
}

let currentTick = priceToTick(amountUsdc) // 85176
let lowerTick = priceToTick(tick2) // 84222
let upperTick = priceToTick(tick3) // 86129

/* 
La dernière chose à noter ici est qu'Uniswap utilise le numéro Q64.96 
pour stocker √P. Il s'agit d'un nombre à virgule fixe comportant 64 bits 
pour la partie entière et 96 bits pour la partie fractionnaire. 
Dans nos calculs ci-dessus, les prix sont des nombres à virgule 
flottante : 70.71, 67.42, et 74.16. Nous devons les convertir en Q64.96. 
Heureusement, c'est simple : il faut multiplier les nombres par 2^96 (Le nombre Q 
est un nombre binaire à virgule fixe, nous devons donc multiplier nos nombres 
décimaux par la base de Q64,96, qui est 2^96). Nous aurons:
*/

const q96 = BigInt(2 ** 96); // Utilisez BigInt pour représenter 2**96

function priceToSqrtp(p) {
    // Calculer la racine carrée de p en tant que nombre flottant
    const sqrtP = Math.sqrt(p);

    // Multiplier par q96 dans l'espace flottant pour éviter la perte de précision,
    // puis convertir le résultat en BigInt pour le résultat final.
    // Assurez-vous que le résultat est arrondi correctement pour 
    // correspondre à l'opération int.
    return BigInt(Math.floor(sqrtP * Number(q96)));
}

console.log(priceToSqrtp(5000).toString()); // 5602277097478614198912276234240
console.log(priceToSqrtp(4500).toString()); // 5314786713428871004159001755648
console.log(priceToSqrtp(5500).toString()); // 5875717789736564987741329162240

/* L'étape suivante consiste à décider combien de jetons nous souhaitons déposer 
dans le pool. La réponse est autant que nous le souhaitons. Les montants ne sont 
pas strictement définis, nous pouvons déposer autant qu'il suffit pour acheter une 
petite quantité d'ETH sans que le prix actuel ne sorte de la fourchette de prix dans 
laquelle nous mettons des liquidités. Pendant le développement et les tests, 
nous serons en mesure de créer n'importe quelle quantité de jetons, donc obtenir 
les quantités souhaitées n'est pas un problème.

Pour notre premier swap, déposons 1 ETH et 5000 USDC.

Pour rappel : L = √(xy) 

Cependant, cette formule s'applique à la courbe infinie. 
Or, nous voulons placer des liquidités dans une fourchette de prix limitée, 
qui n'est qu'un segment de cette courbe infinie. Nous devons calculer L spécifiquement 
pour la fourchette de prix dans laquelle nous allons déposer des liquidités.   
Nous avons besoin de calculs plus avancés.

Pour calculer L pour une fourchette de prix, examinons un fait intéressant dont 
nous avons parlé précédemment : les fourchettes de prix peuvent être épuisées. 
Il est possible d'acheter la totalité d'un jeton d'une fourchette de prix et de 
laisser le pool avec seulement l'autre jeton.

https://uniswapv3book.com/milestone_1/images/curve_liquidity.png

Aux points a et b, il n'y a qu'un seul jeton dans la fourchette : 
ETH au point a et USDC au point b.

Ceci étant dit, nous voulons trouver un L qui permettra au prix de se déplacer 
vers l'un ou l'autre des points. Nous voulons suffisamment de liquidités pour 
que le prix atteigne l'une ou l'autre des limites d'une fourchette de prix. 
Nous voulons donc que L soit calculé sur la base des quantités 
maximales de Δx et de Δy.

Voyons maintenant quels sont les prix à la périphérie. 
Lorsque l'ETH est acheté dans un pool, le prix augmente ; lorsque l'USDC est acheté, 
le prix baisse. Rappelons que le prix est x/y. Ainsi, au point a, le prix est 
le plus bas de la fourchette ; au point b, le prix est le plus élevé.

En fait, les prix ne sont pas définis à ces points parce qu'il n'y a qu'une seule 
réserve dans le pool, mais ce qu'il faut comprendre ici, c'est que le prix autour 
du point b est plus élevé que le prix de départ, et que le prix au point a est plus 
bas que le prix de départ.

Divisez maintenant la courbe de l'image ci-dessus en deux segments : 
un à gauche du point de départ et un à droite du point de départ. 
Nous allons calculer deux L, un pour chacun des segments. Pourquoi ? 
Parce que chacun des deux jetons d'un pool contribue à l'un ou l'autre 
des segments : le segment gauche est constitué uniquement du jeton x, 
et le segment droit est constitué uniquement du jeton y. Cela vient du fait que, 
lors de l'échange, le prix évolue dans un sens ou dans l'autre : il augmente 
ou il diminue. Pour que le prix bouge, il suffit d'avoir l'un ou l'autre des jetons :

- lorsque le prix augmente, seul le jeton x est nécessaire pour l'échange 
(nous achetons le jeton x, donc nous ne voulons prendre que le jeton x de la pool)
- lorsque le prix baisse, seul le jeton y est nécessaire pour l'échange.

Ainsi, la liquidité dans le segment de la courbe à gauche du prix actuel 
consiste uniquement en un jeton x et est calculée uniquement à partir de 
la quantité de jetons x fournie. De même, la liquidité dans le segment de 
la courbe à droite du prix actuel consiste uniquement en un jeton y et est 
calculée uniquement à partir de la quantité de jeton y fournie.

C'est pourquoi, lorsque nous fournissons des liquidités, nous calculons 
deux L et choisissons l'un d'entre eux. Lequel ? Le plus petit. 
Pourquoi ? Parce que le plus grand inclut déjà le plus petit ! 
Nous voulons que les nouvelles liquidités soient réparties uniformément 
le long de la courbe, c'est pourquoi nous voulons ajouter le même L à gauche
et à droite du prix actuel. Si nous choisissons le plus grand, l'utilisateur 
devra fournir plus de liquidités pour compenser la pénurie dans le plus petit. 
C'est possible, bien sûr, mais cela rendrait le contrat intelligent plus complexe.

Que se passe-t-il avec le reste du grand L ? Eh bien, rien. 
Après avoir choisi le plus petit L, nous pouvons simplement le convertir en 
une plus petite quantité du jeton qui a permis d'obtenir le plus grand L, 
ce qui l'ajustera à la baisse. Après cela, nous aurons des quantités de jetons 
qui donneront le même L.

Le dernier détail sur lequel je dois attirer votre attention est le suivant : 
les nouvelles liquidités ne doivent pas modifier le prix actuel. 
C'est-à-dire qu'elle doit être proportionnelle à la part actuelle des réserves. 
C'est pourquoi les deux L peuvent être différents - lorsque la proportion n'est 
pas préservée. Et nous choisissons le petit L pour rétablir la proportion.

Pour rappel :

- Δx = Δ(1/√P) * L
- Δy = Δ√PL

Donc :
- Formule 1 : Δx = ((1 / √(Pc)) - (1 / √(Pb))) * L
- Formule 2 : Δy = (√(Pc) - √(Pa)) * L

Pa est le prix au point a
Pb est le prix au point b
Pc est le prix actuel (voir le graphique ci-dessus). 
Remarquez que, puisque le prix est calculé comme (y / x) (c'est-à-dire le prix de 
x en fonction de y), le prix au point b est plus élevé que le prix actuel et 
le prix au point a. Le prix au point a est le plus bas des trois. 

Comment trouver L à partir :
// Δy = Δ√PL
- De la formule 1 : L = Δx * ((√(Pb) * √(Pc)) / (√(Pb) - √(Pc)))
- De la formule 2 : L = Δy / (√(Pc) - √(Pa))
*/

function priceToSqrtp(p) {
    // Utilisation de Number pour le calcul de la racine carrée, converti ensuite en BigInt
    const sqrtP = BigInt(Math.floor(Math.sqrt(p) * Number(q96)));
    return sqrtP;
}

// Initialisation des valeurs de square root price pour les prix donnés
const sqrtp_low = priceToSqrtp(4545);
const sqrtp_cur = priceToSqrtp(5000);
const sqrtp_upp = priceToSqrtp(5500);

function liquidity0(amount, pa, pb) {
    if (pa > pb) {
        [pa, pb] = [pb, pa];
    }
    // Calcul de la liquidité avec des ajustements pour la précision de BigInt
    return amount * pa * pb / q96 / (pb - pa);
}

function liquidity1(amount, pa, pb) {
    if (pa > pb) {
        [pa, pb] = [pb, pa];
    }
    // Calcul de la liquidité avec des ajustements pour la précision de BigInt
    return amount * q96 / (pb - pa);
}

const eth = BigInt("1000000000000000000"); // 10**18 en notation décimale
const amount_eth = 1n * eth;
const amount_usdc = 5000n * eth;

const liq0 = liquidity0(amount_eth, sqrtp_cur, sqrtp_upp);
const liq1 = liquidity1(amount_usdc, sqrtp_cur, sqrtp_low);
const liq = liq0 < liq1 ? liq0 : liq1;

console.log(liq.toString());
console.log('1517882343751509868544')

/* Puisque nous choisissons les montants que nous allons déposer, ces montants 
peuvent être erronés. Nous ne pouvons pas déposer n'importe quel montant dans 
n'importe quelle fourchette de prix ; le montant des liquidités doit être réparti 
uniformément le long de la courbe de la fourchette de prix dans laquelle nous 
effectuons le dépôt. Ainsi, même si les utilisateurs choisissent les montants, 
le contrat doit les recalculer, et les montants réels seront légèrement différents 
(au moins en raison des arrondis). */

function calcAmount0(liq, pa, pb) {
    if (pa > pb) {
        [pa, pb] = [pb, pa];
    }
    // Assurez-vous que toutes les opérations sont effectuées avec des BigInts
    return (liq * q96 * (pb - pa)) / pa / pb;
}

function calcAmount1(liq, pa, pb) {
    if (pa > pb) {
        [pa, pb] = [pb, pa];
    }
    // Assurez-vous que toutes les opérations sont effectuées avec des BigInts
    return (liq * (pb - pa)) / q96;
}

// Utilisation des valeurs calculées précédemment pour sqrtp_upp, sqrtp_cur, et liq
const amount0 = calcAmount0(liq, sqrtp_upp, sqrtp_cur);
const amount1 = calcAmount1(liq, sqrtp_low, sqrtp_cur);

console.log(amount0.toString(), amount1.toString()); // (998976618347425408, 5000000000000000000000)