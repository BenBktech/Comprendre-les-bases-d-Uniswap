/*
 * LES BASES
 */
// Prenons une Pool de liquidité sur Uniswap V2, sur laquelle nous avons 
// 400 Tokens X
// 400 Tokens Y
let montantTokenXDansLaPool = 400; 
let montantTokenYDansLaPool = 400; 

// On veut donner 200 Token X à la Pool et recevoir en retour des Token Y
let montantTokenXDonnéALaPool = 200; // Δx
let montantTokenYDonnéParLaPool; // Δy

let frais = null; // r

// La constante à retenir
// (x + rΔx)(y − Δy) = xy

// Calculer les montants de token X ou Y que l'on va obtenir
// Δy = (y * r * Δx) / x + r * Δx
// Δx = (x * Δy) / r * (y - Δy)

// On zappe les frais dans ce scénario pour une meilleure compréhension
// On récupère le nombre de Token Y donné par la pool, soit 133.33
montantTokenYDonnéParLaPool = (montantTokenYDansLaPool * montantTokenXDonnéALaPool) / (montantTokenXDansLaPool + montantTokenXDonnéALaPool)

// On récupère le prix du Token X
// Px = y / x = 0.666
let prixTokenX = montantTokenYDansLaPool / (montantTokenXDansLaPool + montantTokenXDonnéALaPool)