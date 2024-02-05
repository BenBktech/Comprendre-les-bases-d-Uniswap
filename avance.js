/*
 * LES BASES
 */

// Prenons une Pool de liquidité sur Uniswap V2, sur laquelle nous avons 
// 100 Tokens X
// 100 Tokens Y
let montantTokenXDansLaPool = 100;
let montantTokenYDansLaPool = 100;

// La constante K est égale à la multiplication du montant de X et de Y
let K = montantTokenXDansLaPool * montantTokenYDansLaPool; // 100 * 100 = 10 000

/*
 * ON CHANGE LES VALEURS
 */

// En fonction du nombre de Token 1 dans la pool, on récupère
// le nombre de Token 2 et inversement
function courbe(token) {
    return K / token;
}

// Si il y a 107 Token Y dans la Pool
let montantTokenY = 107;
// Alors, il y a 93.45794392523365 Token X dans la Pool
let montantTokenX = K / montantTokenY; // ou courbe(montantTokenY)

// Calcul de vérification de la constante K (ici, toujours égale à 10 000)
let constanteK = montantTokenY * montantTokenX;

/*
 * ON CHANGE DE NOUVEAU LES VALEURS
 */

// Ici, on veut avoir, à la fin du swap 177.3 Token X dans la Pool
let montantTokenXFin = 177.3;

// Et donc, on aura 56.40157924421884 Token Y dans la Pool
let montantTokenYFin = K / montantTokenXFin; // ou courbe(montantTokenXFin)

// Calcul de vérification de la constante K (ici, toujours égale à 10 000)
constanteK = montantTokenXFin * montantTokenYFin;

// On a donc bien l'égalité de constante K
console.log(montantTokenY * montantTokenX === montantTokenXFin * montantTokenYFin)

// On doit donc donner 83.84205607476636 Token X (ΔX = montant à donner)
let montantTokenXADonner = montantTokenXFin - montantTokenX;

// Pour recevoir ΔY = (Y ΔX)/(X + ΔX) = Token Y que la pool va nous donner
// Ainsi, en envoyant ΔX Token à la pool, on reçoit 
// ΔY = montantTokenYRecu = 50.59842075578116
let montantTokenYRecu = ((montantTokenY * montantTokenXADonner) / (montantTokenX + montantTokenXADonner))

// Execution price = Y / (X+ΔX) = 0.6034968979131415
let prixExecution = montantTokenY / (montantTokenX + montantTokenXADonner)

// Le prix au début = 1.1449
let prixDébut = montantTokenY / montantTokenX;

// Le prix à la fin = 0.3181138141241897
let prixFin = montantTokenYFin / montantTokenXFin;