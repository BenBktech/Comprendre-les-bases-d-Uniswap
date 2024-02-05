/*
 * ALLER PLUS LOIN
 */

// Prenons une Pool de liquidité sur Uniswap V2, sur laquelle nous avons 
// 22962 Tokens X (DAI)
// 10 Tokens Y (ETH)
let montantDAIPool = 22962;
let montantETHPool = 10;

// Je veux donner 5000 DAI et avoir en échange des ETHs
let montantDaiADonner = 5000;

// Calcul du nombre d'ETH reçus en utilisant la formule correcte
// ΔY = (Y * ΔX) / (X + ΔX)
let ΔY = (montantETHPool * montantDaiADonner) / (montantDAIPool + montantDaiADonner)
console.log(`ETH reçus pour 5000 DAI : ${ΔY}`);

// Le prix au début = montantDAIPool / montantETHPool
let prixDébut = montantDAIPool / montantETHPool;
console.log(`Prix au début : ${prixDébut} DAI/ETH`);

// Mise à jour des montants dans la pool après l'échange
let montantDAIPoolFin = montantDAIPool + montantDaiADonner;
let montantETHPoolFin = montantETHPool - ΔY;

// Le prix à la fin = montantDAIPoolFin / montantETHPoolFin
let prixFin = montantDAIPoolFin / montantETHPoolFin;
console.log(`Prix à la fin : ${prixFin} DAI/ETH`);

// Calcul du prix d'exécution
let prixExecution = montantDaiADonner / ΔY;
console.log(`Prix d'exécution : ${prixExecution} DAI/ETH pour 1 ETH`);

// Vérification
let verif = prixExecution * ΔY;
console.log(`Le prix d'exécution multiplé par le montant d'ETH reçu : ${verif}`);