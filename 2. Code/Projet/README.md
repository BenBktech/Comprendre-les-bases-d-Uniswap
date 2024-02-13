# Introduction

Uniswap déploie plusieurs contrats Pool, chacun étant un marché d'échange d'une paire de jetons. Uniswap regroupe tous ses contrats en deux catégories :

- contrats de base (core),
- et les contrats de périphérie.

Les contrats de base sont, comme leur nom l'indique, des contrats qui implémentent la logique de base. Il s’agit de contrats minimes, peu conviviaux et de bas niveau. Leur objectif est de faire une chose et de la faire de la manière la plus fiable et sécurisée possible. Dans Uniswap V3, il existe 2 contrats de ce type :

- Contrat de pool, qui met en œuvre la logique fondamentale d’un échange décentralisé.
- Contrat de factory, qui sert de registre des contrats de pool et de contrat facilitant le déploiement des pools.

## Pool

Pensons aux données que le contrat stockera :

- Étant donné que chaque contrat de pool est un marché d'échange de deux jetons, nous devons suivre les adresses des deux jetons. Ces adresses seront statiques, définies une fois pour toutes lors du déploiement du pool (elles seront donc immuables).
- Chaque contrat de pool est un ensemble de positions de liquidité. Nous les stockerons dans un mappage, où les clés sont des identifiants de position uniques et les valeurs sont des structures contenant des informations sur les positions.
- Chaque contrat de pool devra également maintenir un registre de ticks – il s'agira d'un mappage avec des clés étant des index de ticks et des valeurs étant des structures stockant des informations sur les ticks.
- Étant donné que la plage de ticks est limitée, nous devons stocker les limites dans le contrat, sous forme de constantes.
- Rappelons que les contrats de pool stockent le montant de liquidité, "L". Nous aurons donc besoin d'une variable pour cela.
- Enfin, nous devons suivre le prix actuel et le tick associé. Nous les stockerons dans un emplacement de stockage pour optimiser la consommation de gaz : ces variables seront souvent lues et écrites ensemble, il est donc logique de bénéficier de la fonctionnalité de regroupement des variables d'état de Solidity.

## Le Code 

```solidity
// src/lib/Tick.sol
library Tick {
    struct Info {
        bool initialized;
        uint128 liquidity;
    }
    ...
}

// src/lib/Position.sol
library Position {
    struct Info {
        uint128 liquidity;
    }
    ...
}

// src/UniswapV3Pool.sol
contract UniswapV3Pool {
    using Tick for mapping(int24 => Tick.Info);
    using Position for mapping(bytes32 => Position.Info);
    using Position for Position.Info;

    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK = -MIN_TICK;

    // Pool tokens, immutable
    address public immutable token0;
    address public immutable token1;

    // Packing variables that are read together
    struct Slot0 {
        // Current sqrt(P)
        uint160 sqrtPriceX96;
        // Current tick
        int24 tick;
    }
    Slot0 public slot0;

    // Amount of liquidity, L.
    uint128 public liquidity;

    // Ticks info
    mapping(int24 => Tick.Info) public ticks;
    // Positions info
    mapping(bytes32 => Position.Info) public positions;

    ...
```

Uniswap V3 utilise de nombreux contrats d'assistance dont "Ticken" et "Position". "using A for B" est une fonctionnalité de Solidity qui vous permet d'étendre le type B avec des fonctions du contrat de bibliothèque A. Cela simplifie la gestion des structures de données complexes.

Nous initialiserons ensuite certaines variables du constructeur :

```solidity
    constructor(
        address token0_,
        address token1_,
        uint160 sqrtPriceX96,
        int24 tick
    ) {
        token0 = token0_;
        token1 = token1_;

        slot0 = Slot0({sqrtPriceX96: sqrtPriceX96, tick: tick});
    }
}
```

Ici, nous définissons l'adresse du jeton immuable et fixons le prix et le tick actuel – nous n'avons pas besoin de fournir de liquidité pour ce dernier.

C'est notre point de départ, et notre objectif dans ce chapitre est de réaliser notre premier échange en utilisant des valeurs pré-calculées et codées en dur.

## Mint 

Le processus de fourniture de liquidités dans Uniswap V2 est appelé "minting". La raison en est que le contrat de pool V2 crée des jetons (jetons LP) en échange de liquidités. La V3 ne fait pas cela, mais elle utilise toujours le même nom pour la fonction. Utilisons-le également :

```solidity
function mint(
    address owner,
    int24 lowerTick,
    int24 upperTick,
    uint128 amount
) external returns (uint256 amount0, uint256 amount1) {
    ...
```

Notre fonction "mint" prendra :

- L'adresse du propriétaire, pour suivre le propriétaire de la liquidité.
- Les ticks supérieures et inférieures, pour définir les limites d'une fourchette de prix.
- Le montant de liquidité que nous souhaitons fournir.

Notez que l'utilisateur spécifie L, pas les montants symboliques réels. Ce n'est bien sûr pas très pratique, mais rappelez-vous que le contrat "Pool" est un contrat de base : il n'est pas destiné à être convivial car il doit implémenter uniquement la logique de base. Dans un chapitre ultérieur, nous établirons un contrat d'assistance qui convertira les montants de jetons en L avant d'appeler "Pool.mint".

Décrivons un plan rapide du fonctionnement du monnayage :

- Un utilisateur spécifie une fourchette de prix et un montant de liquidité ;
- Le contrat met à jour les "ticks", "positions" les cartographies ;
- Le contrat calcule les montants de jetons que l'utilisateur doit envoyer (nous les pré-calculerons et les coderons en dur) ;
- Le contrat prend les jetons de l'utilisateur et vérifie que les montants corrects ont été définis.

Commençons par vérifier les Ticks :

```solidity
if (
    lowerTick >= upperTick ||
    lowerTick < MIN_TICK ||
    upperTick > MAX_TICK
) revert InvalidTickRange();
```

Et en veillant à ce qu’une certaine quantité de liquidité soit fournie :

```solidity
if (amount == 0) revert ZeroLiquidity();
```

Ensuite, ajoutez une tick et une position :

```solidity
ticks.update(lowerTick, amount);
ticks.update(upperTick, amount);

Position.Info storage position = positions.get(
    owner,
    lowerTick,
    upperTick
);
position.update(amount);
```

La fonction "ticks.update" est :

```solidity
// src/lib/Tick.sol
function update(
    mapping(int24 => Tick.Info) storage self,
    int24 tick,
    uint128 liquidityDelta
) internal {
    Tick.Info storage tickInfo = self[tick];
    uint128 liquidityBefore = tickInfo.liquidity;
    uint128 liquidityAfter = liquidityBefore + liquidityDelta;

    if (liquidityBefore == 0) {
        tickInfo.initialized = true;
    }

    tickInfo.liquidity = liquidityAfter;
}
```

Il initialise un tick s'il a 0 liquidité et y ajoute une nouvelle liquidité. Comme vous pouvez le voir, nous appelons cette fonction sur les ticks inférieurs et supérieurs, ainsi de la liquidité est ajoutée aux deux.

La fonction "position.update" est :

```solidity
// src/libs/Position.sol
function update(Info storage self, uint128 liquidityDelta) internal {
    uint128 liquidityBefore = self.liquidity;
    uint128 liquidityAfter = liquidityBefore + liquidityDelta;

    self.liquidity = liquidityAfter;
}
```

Semblable à la fonction de mise à jour des ticks, elle ajoute de la liquidité à une position spécifique. Pour obtenir un poste, nous appelons :

```solidity
// src/libs/Position.sol
...
function get(
    mapping(bytes32 => Info) storage self,
    address owner,
    int24 lowerTick,
    int24 upperTick
) internal view returns (Position.Info storage position) {
    position = self[
        keccak256(abi.encodePacked(owner, lowerTick, upperTick))
    ];
}
...
```

Chaque position est identifiée de manière unique par trois clés : l'adresse du propriétaire, l'index de tick inférieur et l'index de tick supérieur. Nous hachons les trois pour rendre le stockage des données moins cher : une fois hachées, chaque clé prendra 32 octets, au lieu de 96 octets lorsque owner, lowerTick, et upperTicksont des clés distinctes.

Si nous utilisons trois clés, nous avons besoin de trois mappages. Chaque clé serait stockée séparément et prendrait 32 octets puisque Solidity stocke les valeurs dans des emplacements de 32 octets (lorsque le compactage n'est pas appliqué).

Ensuite, en continuant avec le "minting", nous devons calculer les montants que l'utilisateur doit déposer. Heureusement, nous avons déjà compris les formules et calculé les montants exacts dans la partie précédente (1. Bases). Nous allons donc les coder en dur :

```
amount0 = 0.998976618347425280 ether;
amount1 = 5000 ether;
```

Nous mettrons également à jour le "liquidity" pool, en fonction des "amount" ajoutés.

```solidity
liquidity += uint128(amount);
```

Nous sommes maintenant prêts à récupérer les jetons de l'utilisateur. Cela se fait via un rappel :

```solidity
function mint(...) ... {
    ...

    uint256 balance0Before;
    uint256 balance1Before;
    if (amount0 > 0) balance0Before = balance0();
    if (amount1 > 0) balance1Before = balance1();
    IUniswapV3MintCallback(msg.sender).uniswapV3MintCallback(
        amount0,
        amount1
    );
    if (amount0 > 0 && balance0Before + amount0 > balance0())
        revert InsufficientInputAmount();
    if (amount1 > 0 && balance1Before + amount1 > balance1())
        revert InsufficientInputAmount();

    ...
}

function balance0() internal returns (uint256 balance) {
    balance = IERC20(token0).balanceOf(address(this));
}

function balance1() internal returns (uint256 balance) {
    balance = IERC20(token1).balanceOf(address(this));
}
```

Tout d’abord, nous enregistrons les soldes actuels des jetons. Ensuite, nous appelons la méthode "uniswapV3MintCallback" sur l'appelant : c'est le rappel. On s'attend à ce que l'appelant (celui qui appelle "mint") soit un contrat car les adresses qui ne sont pas des contrats ne peuvent pas implémenter de fonctions dans Ethereum. L'utilisation d'un callback ici, même si il n'est pas du tout user-friendly, permet au contrat de calculer les montants des jetons en utilisant son état actuel. Ceci est essentiel car nous ne pouvons pas faire confiance aux utilisateurs.

L'appelant doit implémenter "uniswapV3MintCallback" et transférer des jetons vers le contrat "Pool" dans cette fonction. Après avoir appelé la fonction de callback, nous continuons à vérifier si les soldes (balances) du contrat "Pool" ont changé ou non : nous exigeons qu'ils augmentent d'au moins "amount0" et "amount1" respectivement – ​​cela signifierait que l'appelant a transféré des jetons à la pool.

Enfin, nous déclenchons un événement "Mint" :

```solidity
emit Mint(msg.sender, owner, lowerTick, upperTick, amount, amount0, amount1);
```

Les événements sont la manière dont les données du contrat sont indexées dans Ethereum pour une recherche ultérieure. C'est une bonne pratique de déclencher un événement chaque fois que l'état du contrat est modifié pour informer l'explorateur de blockchain lorsque cela s'est produit. Les événements véhiculent également des informations utiles : dans notre cas, il s'agit de l'adresse de l'appelant, de l'adresse du propriétaire de la position de liquidité, des ticks supérieurs et inférieurs, des nouvelles liquidités et des montants des jetons. Ces informations seront stockées sous forme de journal et toute autre personne pourra collecter tous les événements du contrat et reproduire l'activité du contrat sans parcourir et analyser tous les blocs et transactions.

## Test

A ce stade, nous ne savons pas si tout fonctionne correctement. Avant de déployer notre contrat, nous allons rédiger une série de tests pour nous assurer que le contrat fonctionne correctement. Heureusement pour nous, Forge est un excellent framework de test qui facilitera les tests.

Créez un nouveau fichier de test :

```solidity
// test/UniswapV3Pool.t.sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.14;

import "forge-std/Test.sol";

contract UniswapV3PoolTest is Test {
    function setUp() public {}

    function testExample() public {
        assertTrue(true);
    }
}
```

Lançons-le :

```solidity
$ forge test
Running 1 test for test/UniswapV3Pool.t.sol:UniswapV3PoolTest
[PASS] testExample() (gas: 279)
Test result: ok. 1 passed; 0 failed; finished in 5.07ms
```

Ça passe! Jusqu'à présent, notre test vérifie uniquement que true = true !

Les contrats de test ne sont que des contrats qui héritent de "forge-std/Test.sol". Ce contrat est un ensemble d'utilitaires de test, nous allons les apprendre étape par étape.

Les contrats de tests suivent une convention spécifique :

- "setUp" : fonction utilisée pour configurer des cas de test. Dans chaque cas de test, nous souhaitons disposer d'un environnement configuré, comme des contrats déployés, des jetons créés et des pools initialisés. Nous ferons tout cela dans "setUp".
- Chaque scénario de test commence par le préfixe "test", par exemple "testMint()". Cela permettra à Forge de distinguer les "test" des "fonctions d'assistance" (nous pouvons également avoir n'importe quelle fonction de notre choix).

Testons maintenant le "minting".

## Test Tokens

Pour tester le "minting", nous avons besoin de tokens. Ce n'est pas un problème car nous pouvons déployer n'importe quel contrat dans les tests ! De plus, Forge peut installer des contrats open-source comme dépendances. Plus précisément, nous avons besoin d'un contrat ERC20 avec une fonctionnalité de "mint". Nous allons utiliser le contrat ERC20 de Solmate, une collection de contrats optimisés pour le gaz, et créer un contrat ERC20 qui hérite du contrat Solmate et expose le "minting" (il est public par défaut).

Installons solmate :

```$ forge install rari-capital/solmate```

Ensuite, créons le contrat ERC20Mintable.sol dans le dossier test (nous n'utiliserons le contrat que dans les tests) :

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.14;

import "solmate/tokens/ERC20.sol";

contract ERC20Mintable is ERC20 {
    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) ERC20(_name, _symbol, _decimals) {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
```

Notre "ERC20Mintable" hérite de toutes les fonctionnalités de "solmate/tokens/ERC20.sol" et nous implémentons en plus la méthode publique "mint" qui nous permettra de minter n'importe quel nombre de tokens.

## Minting

Nous sommes maintenant prêts à tester le monnayage.

Tout d'abord, déployons tous les contrats nécessaires :

```solidity
// test/UniswapV3Pool.t.sol
...
import "./ERC20Mintable.sol";
import "../src/UniswapV3Pool.sol";

contract UniswapV3PoolTest is Test {
    ERC20Mintable token0;
    ERC20Mintable token1;
    UniswapV3Pool pool;

    function setUp() public {
        token0 = new ERC20Mintable("Ether", "ETH", 18);
        token1 = new ERC20Mintable("USDC", "USDC", 18);
    }

    ...
```

Dans la fonction "setUp", nous déployons les tokens mais pas les pools ! En effet, tous nos scénarios de test utiliseront les mêmes tokens, mais chacun d'entre eux aura une pool unique.

Pour rendre la configuration des pools plus propre et plus simple, nous allons le faire dans une fonction séparée, "setupTestCase", qui prend un ensemble de paramètres de cas de test. Dans notre premier scénario de test, nous allons tester la réussite du minting de liquidités. Voici à quoi ressemblent les paramètres du scénario de test :

```solidity
function testMintSuccess() public {
    TestCaseParams memory params = TestCaseParams({
        wethBalance: 1 ether,
        usdcBalance: 5000 ether,
        currentTick: 85176,
        lowerTick: 84222,
        upperTick: 86129,
        liquidity: 1517882343751509868544,
        currentSqrtP: 5602277097478614198912276234240,
        shouldTransferInCallback: true,
        mintLiqudity: true
    });
```

- Nous prévoyons de déposer 1 ETH et 5000 USDC dans le pool.
- Nous voulons que le tick actuel soit 85176, et que les ticks inférieur et supérieur soient respectivement 84222 et 86129 (nous avons calculé ces valeurs dans le chapitre précédent).
- Nous spécifions la liquidité précalculée et le √P courant.
- Nous voulons également déposer de la liquidité (paramètre "mintLiquidity") et transférer des tokens lorsque le contrat de pool le demande ("shouldTransferInCallback"). Nous ne voulons pas faire cela dans chaque scénario de test, donc nous voulons avoir les flags.

Ensuite, nous appelons "setupTestCase" avec les paramètres ci-dessus :

```solidity
function setupTestCase(TestCaseParams memory params)
    internal
    returns (uint256 poolBalance0, uint256 poolBalance1)
{
    token0.mint(address(this), params.wethBalance);
    token1.mint(address(this), params.usdcBalance);

    pool = new UniswapV3Pool(
        address(token0),
        address(token1),
        params.currentSqrtP,
        params.currentTick
    );

    if (params.mintLiqudity) {
        (poolBalance0, poolBalance1) = pool.mint(
            address(this),
            params.lowerTick,
            params.upperTick,
            params.liquidity
        );
    }

    shouldTransferInCallback = params.shouldTransferInCallback;
}
```

Dans cette fonction, nous mintons des jetons et déployons une pool. De plus, lorsque l'indicateur "mintLiquidity" est activé, nous mintons la liquidité dans la pool. Enfin, nous définissons l'indicateur "shouldTransferInCallback" pour qu'il soit lu dans le callback de mint :

```solidity 
function uniswapV3MintCallback(uint256 amount0, uint256 amount1) public {
    if (shouldTransferInCallback) {
        token0.transfer(msg.sender, amount0);
        token1.transfer(msg.sender, amount1);
    }
}
```

C'est le contrat de test qui fournira les liquidités et appellera la fonction mint sur la pool, il n'y a pas d'utilisateurs. Le contrat de test agira en tant qu'utilisateur, et pourra donc implémenter la fonction de callback (mint).

Il n'est pas obligatoire de mettre en place des cas de test comme celui-ci, vous pouvez le faire de la manière qui vous semble la plus confortable. Les contrats de test ne sont que des contrats.

Dans "testMintSuccess", nous voulons nous assurer que le contrat de pool :

- prend les bonnes quantités de jetons de notre part ;
- crée une position avec la bonne clé et la bonne liquidité ;
- initialise les ticks supérieurs et inférieurs que nous avons spécifiés ;
- a une valeur √P et L corrects.

Faisons-le.

Le mint a lieu dans "setupTestCase", nous n'avons donc pas besoin de le faire à nouveau. La fonction renvoie également les montants que nous avons fournis, vérifions-les donc :

```solidity
(uint256 poolBalance0, uint256 poolBalance1) = setupTestCase(params);

uint256 expectedAmount0 = 0.998976618347425280 ether;
uint256 expectedAmount1 = 5000 ether;
assertEq(
    poolBalance0,
    expectedAmount0,
    "incorrect token0 deposited amount"
);
assertEq(
    poolBalance1,
    expectedAmount1,
    "incorrect token1 deposited amount"
);
```

Nous attendons des montants spécifiques précalculés. Nous pouvons également vérifier que ces montants ont été transférés dans la pool :

```solidity
assertEq(token0.balanceOf(address(pool)), expectedAmount0);
assertEq(token1.balanceOf(address(pool)), expectedAmount1);
```

Ensuite, nous devons vérifier la position que le pool a créée pour nous. Vous vous souvenez que la clé dans le mappage des positions est un hachage ? Nous devons le calculer manuellement, puis obtenir notre position à partir du contrat :

```solidity
bytes32 positionKey = keccak256(
    abi.encodePacked(address(this), params.lowerTick, params.upperTick)
);
uint128 posLiquidity = pool.positions(positionKey);
assertEq(posLiquidity, params.liquidity);
```

Comme "Position.Info" est une structure, elle est déstructurée lorsqu'elle est recherchée : chaque champ est assigné à une variable distincte.

Viennent ensuite les ticks. Là encore, c'est simple :

```solidity
(bool tickInitialized, uint128 tickLiquidity) = pool.ticks(
    params.lowerTick
);
assertTrue(tickInitialized);
assertEq(tickLiquidity, params.liquidity);

(tickInitialized, tickLiquidity) = pool.ticks(params.upperTick);
assertTrue(tickInitialized);
assertEq(tickLiquidity, params.liquidity);
```

Puis finalement, √P et L :

```solidity
(uint160 sqrtPriceX96, int24 tick) = pool.slot0();
assertEq(
    sqrtPriceX96,
    5602277097478614198912276234240,
    "invalid current sqrtP"
);
assertEq(tick, 85176, "invalid current tick");
assertEq(
    pool.liquidity(),
    1517882343751509868544,
    "invalid current liquidity"
);
```

## Échecs

Bien entendu, il ne suffit pas de tester uniquement les scénarios réussis. Nous devons également tester les cas d'échec. Qu'est-ce qui peut mal se passer lorsque l'on fournit des liquidités ? Voici quelques indices :

- Les ticks supérieurs et inférieurs sont trop grands ou trop petits.
- La liquidité fournie est nulle.
- Le fournisseur de liquidité n'a pas assez de jetons.

## Premier Swap

Maintenant que nous disposons de liquidités, nous pouvons procéder à notre premier échange !

## Calculer les montants des swaps

La première étape, bien sûr, est de déterminer comment calculer les montants des échanges. Encore une fois, choisissons et codons en dur un montant d'USDC que nous allons échanger contre de l'ETH. Nous allons acheter de l'ETH pour 42 USDC.

Après avoir décidé combien de tokens nous voulons vendre, nous devons calculer combien de tokens nous obtiendrons en échange. Dans Uniswap V2, nous aurions utilisé les réserves du pool actuel, mais dans Uniswap V3, nous avons L et √P et nous savons que lors d'un échange à l'intérieur d'une fourchette de prix, seul  
√P change et L reste inchangé (Uniswap V3 agit exactement comme V2 lorsque l'échange se fait uniquement à l'intérieur d'une fourchette de prix). Nous savons également que :

```
L = Δy / Δ√P
```

Et... nous connaissons Δy ! Il s'agit des 42 USDC que nous allons échanger ! Ainsi, nous pouvons déterminer comment la vente de 42 USDC affectera la valeur actuelle de √P actuel, compte tenu de L :

```
Δ√P = Δy / L
```

Dans Uniswap V3, nous choisissons le prix auquel nous voulons que notre échange aboutisse (rappelons que l'échange modifie le prix actuel, c'est-à-dire qu'il déplace le prix actuel le long de la courbe). Connaissant le prix cible, le contrat calculera la quantité de jetons d'entrée qu'il doit nous prendre et la quantité respective de jetons de sortie qu'il nous donnera.

Insérons nos chiffres dans la formule ci-dessus :

```
Δ√P = 42USDC / 1517882343751509868544 = 2192253463713690532467206957
```

Après l'avoir ajouté à l'actuel √P actuel, on obtient le prix cible :

```
√(P cible) = √(P courant) + Δ√P
√(P cible) = 5604469350942327889444743441197
```

Pour calculer le prix cible en Python :

```python
amount_in = 42 * eth
price_diff = (amount_in * q96) // liq
price_next = sqrtp_cur + price_diff
print("New price:", (price_next / q96) ** 2)
print("New sqrtP:", price_next)
print("New tick:", price_to_tick((price_next / q96) ** 2))
# New price: 5003.913912782393
# New sqrtP: 5604469350942327889444743441197
# New tick: 85184
```

Après avoir trouvé le prix cible, nous pouvons calculer les montants des jetons en utilisant les fonctions de calcul des montants d'un chapitre précédent :

```
x = L(√(Pb) - √(Pa)) / √(Pb) * √(Pa)
y = L(√(Pb) - √(Pa))
```

En Python :

```python
amount_in = calc_amount1(liq, price_next, sqrtp_cur)
amount_out = calc_amount0(liq, price_next, sqrtp_cur)

print("USDC in:", amount_in / eth)
print("ETH out:", amount_out / eth)
# USDC in: 42.0
# ETH out: 0.008396714242162444
```

Pour vérifier les montants, rappelons une autre formule :

Δx = Δ(1/√P)L

En utilisant cette formule, nous pouvons trouver le montant d'Eth que nous achetons, Δx, connaissant le changement de prix Δ(1/√P) et la liquidité L. Cependant, soyez prudents : Δ(1/√P) n'est pas 1/(Δ√P). La première est la variation du prix de l'ETH, et elle peut être calculée à l'aide de l'expression suivante :

```
Δ(1/√P) = 1/√(P cible) - 1/√(P courant)
```

Heureusement, nous connaissons déjà toutes les valeurs, et nous pouvons donc les introduire immédiatement (cela risque de ne pas tenir sur votre écran !):

```
Δ(1/√P) = (1 / 5604469350942327889444743441197) - (1 / 5602277097478614198912276234240) = −6.982190286589445e-35∗2^96 = −0.00000553186106731426
```

Maintenant, trouvons Δx :

```
Δx = −0.00000553186106731426 ∗ 1517882343751509868544 = −8396714242162698
```

Ce qui représente 0,008396714242162698 ETH, et qui est très proche du montant que nous avons trouvé ci-dessus ! Notez que ce montant est négatif puisque nous le retirons de la pool.

## Implémentation d'un Swap

L'échange est implémenté dans la fonction "swap" :

```solidity 
function swap(address recipient)
    public
    returns (int256 amount0, int256 amount1)
{
    ...
```

À l’heure actuelle, il suffit d’un destinataire, qui est un destinataire de jetons.

Tout d’abord, nous devons trouver le prix cible et le tick, ainsi que calculer les montants des jetons. Encore une fois, nous allons simplement coder en dur les valeurs que nous avons calculées plus tôt pour garder les choses aussi simples que possible :

```solidity 
...
int24 nextTick = 85184;
uint160 nextPrice = 5604469350942327889444743441197;

amount0 = -0.008396714242162444 ether;
amount1 = 42 ether;
...
```

Ensuite, nous devons mettre à jour le tick actuel et "sqrtP" puisque le trading affecte le prix actuel :

```solidity
...
(slot0.tick, slot0.sqrtPriceX96) = (nextTick, nextPrice);
...
```

Ensuite, le contrat envoie des jetons au destinataire et permet à l'appelant de transférer le montant saisi dans le contrat :

```solidity
...
IERC20(token0).transfer(recipient, uint256(-amount0));

uint256 balance1Before = balance1();
IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(
    amount0,
    amount1
);
if (balance1Before + uint256(amount1) < balance1())
    revert InsufficientInputAmount();
...
```

Encore une fois, nous utilisons un rappel pour transmettre le contrôle à l'appelant et le laisser transférer les jetons. Après cela, nous vérifions que le solde du pool est correct et inclut le montant saisi.

Enfin, le contrat émet un événement "Swap" pour rendre le swap détectable. L'événement comprend toutes les informations sur l'échange :

```solidity
...
emit Swap(
    msg.sender,
    recipient,
    amount0,
    amount1,
    slot0.sqrtPriceX96,
    liquidity,
    slot0.tick
);
```

Et c'est tout! La fonction envoie simplement une certaine quantité de jetons à l'adresse du destinataire spécifiée et attend un certain nombre d'autres jetons en échange.

## Test du swap 

Maintenant, nous pouvons tester la fonction swap. Dans le même fichier de test, créez la fonction "testSwapBuyEthfonction" et configurez le scénario de test. Ce cas de test utilise les mêmes paramètres que "testMintSuccess" :

```solidity
function testSwapBuyEth() public {
    TestCaseParams memory params = TestCaseParams({
        wethBalance: 1 ether,
        usdcBalance: 5000 ether,
        currentTick: 85176,
        lowerTick: 84222,
        upperTick: 86129,
        liquidity: 1517882343751509868544,
        currentSqrtP: 5602277097478614198912276234240,
        shouldTransferInCallback: true,
        mintLiqudity: true
    });
    (uint256 poolBalance0, uint256 poolBalance1) = setupTestCase(params);

    ...
```

Les prochaines étapes seront cependant différentes.

Nous n'allons pas tester que la liquidité a été correctement ajoutée au pool puisque nous avons testé cette fonctionnalité dans les autres cas de tests.

Pour effectuer le swap test, nous avons besoin de 42 USDC :

```solidity
token1.mint(address(this), 42 ether);
```

Avant d'effectuer l'échange, nous devons nous assurer que nous pouvons transférer les jetons vers le contrat de pool lorsqu'il les demande :

```solidity
function uniswapV3SwapCallback(int256 amount0, int256 amount1) public {
    if (amount0 > 0) {
        token0.transfer(msg.sender, uint256(amount0));
    }

    if (amount1 > 0) {
        token1.transfer(msg.sender, uint256(amount1));
    }
}
```

Étant donné que les montants lors d'un swap peuvent être positifs (le montant envoyé à la pool) et négatifs (le montant retiré de la pool), lors du rappel, nous souhaitons uniquement envoyer le montant positif, c'est-à-dire le montant que nous négocions.

Maintenant, nous pouvons appeler "swap" :

```solidity
(int256 amount0Delta, int256 amount1Delta) = pool.swap(address(this));
```

La fonction renvoie les montants de jetons utilisés dans le swap, et nous pouvons les vérifier immédiatement :

```solidity
assertEq(amount0Delta, -0.008396714242162444 ether, "invalid ETH out");
assertEq(amount1Delta, 42 ether, "invalid USDC in");
```

Ensuite, nous devons nous assurer que les jetons ont été transférés depuis l'appelant :

```solidity
assertEq(
    token0.balanceOf(address(this)),
    uint256(userBalance0Before - amount0Delta),
    "invalid user ETH balance"
);
assertEq(
    token1.balanceOf(address(this)),
    0,
    "invalid user USDC balance"
);
```

Et envoyé au contrat de pool :

```solidity
assertEq(
    token0.balanceOf(address(pool)),
    uint256(int256(poolBalance0) + amount0Delta),
    "invalid pool ETH balance"
);
assertEq(
    token1.balanceOf(address(pool)),
    uint256(int256(poolBalance1) + amount1Delta),
    "invalid pool USDC balance"
);
```

Enfin, nous vérifions que l'état du pool a été correctement mis à jour :

```solidity
(uint160 sqrtPriceX96, int24 tick) = pool.slot0();
assertEq(
    sqrtPriceX96,
    5604469350942327889444743441197,
    "invalid current sqrtP"
);
assertEq(tick, 85184, "invalid current tick");
assertEq(
    pool.liquidity(),
    1517882343751509868544,
    "invalid current liquidity"
);
```

Notez que le swap ne modifie pas la liquidité actuelle – dans un chapitre ultérieur, nous verrons quand cela la modifie.

## Manager Contract

Avant de déployer notre contrat de pool, nous devons résoudre un problème. Comme vous vous en souvenez, les contrats Uniswap V3 sont divisés en deux catégories :

- Contrats de base qui implémentent les fonctions de base et ne fournissent pas d'interfaces conviviales.
- Contrats de périphérie qui mettent en œuvre des interfaces conviviales pour les contrats principaux.

Le contrat de pool est un contrat de base, il n'est pas censé être convivial et flexible. Il attend de l'appelant qu'il fasse tous les calculs (prix, montants) et qu'il fournisse les paramètres d'appel appropriés. Il n'utilise pas non plus "transferFrom" de ERC20 pour transférer les jetons de l'appelant. Au lieu de cela, il utilise deux rappels :

- "uniswapV3MintCallback", qui est appelé lors du mint de liquidités ;
- "uniswapV3SwapCallback", qui est appelé lors du swap de jetons.

Lors de nos tests, nous avons implémenté ces rappels dans le contrat de test. Comme seul un contrat peut les mettre en œuvre, le contrat de pool ne peut pas être appelé par les utilisateurs réguliers (adresses non contractuelles). C'est bon. Mais plus maintenant.

Notre prochaine étape consiste à déployer le contrat de pool sur une blockchain locale et à interagir avec elle à partir d'une application frontale. Ainsi, nous devons construire un contrat qui permettra aux adresses non contractuelles d'interagir avec le pool. Faisons-le maintenant !

## Flux de travail

Voici comment fonctionnera le contrat manager :

- Pour générer des liquidités, nous approuverons la dépense de jetons dans le cadre du contrat manager.
- Nous appellerons ensuite la fonction "mint" du contrat manager et lui transmettrons les paramètres de mint, ainsi que l'adresse de la pool dans laquelle nous souhaitons fournir des liquidités.
- Le contrat manager appellera la fonction "mint" de la pool et mettra en œuvre "uniswapV3MintCallback". Il aura la permission d'envoyer nos jetons au contrat de pool.
- Pour échanger des jetons, nous approuverons également la dépense des jetons dans le contrat manager.
- Nous appellerons ensuite la fonction "swap" du contrat manager et, comme pour le minting, elle transmettra l'appel à la pool. Le contrat manager enverra nos jetons au contrat pool, et le contrat pool les échangera et nous enverra le montant de sortie.

Ainsi, le contrat manager fera office d’intermédiaire entre les utilisateurs et les pools.

## Transmettre des données aux callbacks

Avant d'implémenter le contrat manager, nous devons mettre à jour le contrat pool.

Le contrat manager fonctionnera avec n'importe quelle pool et permettra à n'importe quelle adresse de l'appeler. Pour ce faire, nous devons mettre à jour les callbacks : nous voulons leur passer différentes adresses de pools et d'utilisateurs. Examinons notre implémentation actuelle de "uniswapV3MintCallback" (dans le contrat de test) :

```solidity
function uniswapV3MintCallback(uint256 amount0, uint256 amount1) public {
    if (transferInMintCallback) {
        token0.transfer(msg.sender, amount0);
        token1.transfer(msg.sender, amount1);
    }
}
```

Voici les points clés :

- La fonction transfère les jetons appartenant au contrat de test - nous voulons qu'elle transfère les jetons de l'appelant en utilisant "transferFrom".
- La fonction connaît token0 et token1, qui seront différents pour chaque pool.

Idée : nous devons changer les arguments de la callback afin de pouvoir passer les adresses de l'utilisateur et de la pool.

Maintenant, regardons le callback swap :

```solidity
function uniswapV3SwapCallback(int256 amount0, int256 amount1) public {
    if (amount0 > 0 && transferInSwapCallback) {
        token0.transfer(msg.sender, uint256(amount0));
    }

    if (amount1 > 0 && transferInSwapCallback) {
        token1.transfer(msg.sender, uint256(amount1));
    }
}
```

Identiquement, il transfère les tokens du contrat de test et connaît token0 et token1.

Pour passer les données supplémentaires aux callbacks, nous devons d'abord les passer à mint et swap (puisque les callbacks sont appelés à partir de ces fonctions). Cependant, comme ces données supplémentaires ne sont pas utilisées dans les fonctions et pour ne pas rendre leurs arguments plus compliqués, nous allons encoder les données supplémentaires en utilisant abi.encode().

Définissons les données supplémentaires comme une structure :

```solidity
// src/UniswapV3Pool.sol
...
struct CallbackData {
    address token0;
    address token1;
    address payer;
}
...
```

Puis transmettre les données encodées aux callbacks :

```solidity
function mint(
    address owner,
    int24 lowerTick,
    int24 upperTick,
    uint128 amount,
    bytes calldata data // <--- New line
) external returns (uint256 amount0, uint256 amount1) {
    ...
    IUniswapV3MintCallback(msg.sender).uniswapV3MintCallback(
        amount0,
        amount1,
        data // <--- New line
    );
    ...
}

function swap(address recipient, bytes calldata data) // <--- `data` added
    public
    returns (int256 amount0, int256 amount1)
{
    ...
    IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(
        amount0,
        amount1,
        data // <--- New line
    );
    ...
}
```

Nous pouvons maintenant lire les données supplémentaires dans les rappels du contrat de test.

```solidity
function uniswapV3MintCallback(
    uint256 amount0,
    uint256 amount1,
    bytes calldata data
) public {
    if (transferInMintCallback) {
        UniswapV3Pool.CallbackData memory extra = abi.decode(
            data,
            (UniswapV3Pool.CallbackData)
        );

        IERC20(extra.token0).transferFrom(extra.payer, msg.sender, amount0);
        IERC20(extra.token1).transferFrom(extra.payer, msg.sender, amount1);
    }
}
```

## Implémentation du contrat de gestionnaire

Outre l'implémentation des callbacks, le contrat manager ne fera pas grand chose : il redirigera simplement les appels vers un contrat pool. Il s'agit d'un contrat très minimaliste pour le moment :

```solidity
pragma solidity ^0.8.14;

import "../src/UniswapV3Pool.sol";
import "../src/interfaces/IERC20.sol";

contract UniswapV3Manager {
    function mint(
        address poolAddress_,
        int24 lowerTick,
        int24 upperTick,
        uint128 liquidity,
        bytes calldata data
    ) public {
        UniswapV3Pool(poolAddress_).mint(
            msg.sender,
            lowerTick,
            upperTick,
            liquidity,
            data
        );
    }

    function swap(address poolAddress_, bytes calldata data) public {
        UniswapV3Pool(poolAddress_).swap(msg.sender, data);
    }

    function uniswapV3MintCallback(...) {...}
    function uniswapV3SwapCallback(...) {...}
}
```

Les callbacks sont identiques à ceux du contrat de test, à l'exception du fait qu'il n'y a pas de flags transferInMintCallback et transferInSwapCallback puisque le contrat manager transfère toujours les tokens.

Nous sommes maintenant prêts à déployer et à intégrer une application frontale !

## Déploiement

Très bien, notre contrat de pool est terminé. Voyons maintenant comment nous pouvons le déployer sur un réseau Ethereum local afin de pouvoir l'utiliser ultérieurement à partir d'une application frontale.

## Exécuter une blockchain locale

Anvil ne nécessite pas de configuration, nous pouvons l'exécuter avec une seule commande et cela fera :

```anvil --code-size-limit 50000```

Nous allons écrire de gros contrats qui ne rentrent pas dans la limite de taille du contrat Ethereum (qui est 24576 octets), nous devons donc dire à Anvil d'autoriser des contrats intelligents plus importants.

Anvil fonctionne avec un seul nœud Ethereum, ce n'est donc pas un réseau, mais ce n'est pas grave. Par défaut, il crée 10 comptes avec 10 000 ETH dans chacun d'eux. Il imprime les adresses et les clés privées associées lorsqu'il démarre - nous utiliserons l'une de ces adresses lors du déploiement et de l'interaction avec le contrat à partir de l'interface utilisateur.

## Premier déploiement

Le déploiement d'un contrat consiste essentiellement à

- Compiler le code source en bytecode EVM.
- Envoyer une transaction avec le bytecode.
- Créer une nouvelle adresse, exécuter la partie constructeur du bytecode et stocker le bytecode déployé sur l'adresse. Cette étape est réalisée automatiquement par un nœud Ethereum lorsque la transaction de création de votre contrat est minée.

Le déploiement se compose généralement de plusieurs étapes : préparation des paramètres, déploiement des contrats auxiliaires, déploiement des contrats principaux, initialisation des contrats, etc. Les scripts permettent d'automatiser ces étapes, et nous allons écrire des scripts dans Solidity !

Créez le contrat scripts/DeployDevelopment.sol avec ce contenu :

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.14;

import "forge-std/Script.sol";

contract DeployDevelopment is Script {
    function run() public {
      ...
    }
}
```

Il ressemble beaucoup au contrat de test, à la seule différence qu'il hérite du contrat Script, et non de Test. Et, par convention, nous devons définir la fonction run qui sera le corps de notre script de déploiement. Dans la fonction run, nous définissons d'abord les paramètres du déploiement :

```solidity
uint256 wethBalance = 1 ether;
uint256 usdcBalance = 5042 ether;
int24 currentTick = 85176;
uint160 currentSqrtP = 5602277097478614198912276234240;
```

Il s'agit des mêmes valeurs que celles que nous avons utilisées précédemment. Remarquez que nous sommes sur le point de frapper 5042 USDC - soit 5000 USDC que nous fournirons comme liquidité dans la pool et 42 USDC que nous vendrons dans le cadre d'un swap.

Ensuite, nous définissons l'ensemble des étapes qui seront exécutées dans le cadre de la transaction de déploiement (en fait, chacune des étapes sera une transaction distincte). Pour cela, nous utilisons les cheat codes startBroadcast/endBroadcast :

```solidity
vm.startBroadcast();
...
vm.stopBroadcast();
```

Tout ce qui se passe après le cheat code broadcast() ou entre startBroadcast()/stopBroadcast() est converti en transactions et ces transactions sont envoyées au nœud qui exécute le script.

Entre les cheat codes de diffusion, nous placerons les étapes de déploiement proprement dites. Tout d'abord, nous devons déployer les jetons :

```solidity
ERC20Mintable token0 = new ERC20Mintable("Wrapped Ether", "WETH", 18);
ERC20Mintable token1 = new ERC20Mintable("USD Coin", "USDC", 18);
```

Nous ne pouvons pas déployer le pool sans avoir de tokens, nous devons donc d'abord les déployer.

Puisque nous déployons sur un réseau de développement local, nous devons déployer les tokens nous-mêmes. Dans le réseau principal et les réseaux de test publics (Ropsten, Goerli, Sepolia), les jetons sont déjà créés. Ainsi, pour les déployer sur ces réseaux, nous devrons écrire des scripts de déploiement spécifiques à ces réseaux.

L'étape suivante consiste à déployer le contrat de pool :

```solidity
UniswapV3Pool pool = new UniswapV3Pool(
    address(token0),
    address(token1),
    currentSqrtP,
    currentTick
);
```

L'étape suivante est le déploiement du contrat manager :

```solidity
UniswapV3Manager manager = new UniswapV3Manager();
```

Enfin, nous pouvons monnayer une certaine quantité d'ETH et d'USDC à notre adresse :

```solidity
token0.mint(msg.sender, wethBalance);
token1.mint(msg.sender, usdcBalance);
```

msg.sender dans les scripts Foundry est l'adresse qui envoie les transactions dans le bloc de diffusion. Nous pourrons la définir lors de l'exécution des scripts.

Enfin, à la fin du script, ajoutez quelques appels console.log pour imprimer les adresses des contrats déployés :

```solidity
console.log("WETH address", address(token0));
console.log("USDC address", address(token1));
console.log("Pool address", address(pool));
console.log("Manager address", address(manager));
```

Très bien, lançons le script (assurez-vous qu'Anvil tourne dans une autre fenêtre de terminal) :

```
forge script script/DeployDevelopment.s.sol --rpc-url http://localhost:8545 --broadcast --private-key $PRIVATE_KEY  --code-size-limit 50000
```

Nous augmentons à nouveau la taille du code du contrat intelligent afin que le compilateur n'échoue pas.

--broadcast active la diffusion des transactions. Elle n'est pas activée par défaut car tous les scripts n'envoient pas de transactions. --fork-url définit l'adresse du noeud vers lequel envoyer les transactions. --private-key définit le portefeuille de l'expéditeur : une clé privée est nécessaire pour signer les transactions. Vous pouvez choisir n'importe laquelle des clés privées imprimées par Anvil au démarrage :

0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Le déploiement prend quelques secondes. À la fin, vous verrez une liste des transactions envoyées. Les accusés de réception des transactions sont également enregistrés dans le dossier de diffusion. Dans Anvil, vous verrez également de nombreuses lignes avec eth_sendRawTransaction, eth_getTransactionByHash, et eth_getTransactionReceipt - après avoir envoyé des transactions à Anvil, Forge utilise l'API JSON-RPC pour vérifier leur statut et obtenir les résultats de l'exécution de la transaction (reçus).

Félicitations ! Vous venez de déployer un contrat intelligent !

## Interagir avec les contrats, ABI

### Solde des jetons

Vérifions le solde de WETH de l'adresse du déployeur. La signature de la fonction est balanceOf(address) (comme défini dans l'ERC-20). Pour trouver l'ID de cette fonction (son sélecteur), nous allons la hacher et prendre les quatre premiers octets :

```cast keccak "balanceOf(address)"| cut -b 1-10```

Pour transmettre l'adresse, il suffit de l'ajouter au sélecteur de fonction (et d'ajouter un remplissage à gauche jusqu'à 32 chiffres, puisque les adresses prennent 32 octets dans les données d'appel de fonction) :

```0x70a08231000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266```

0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 est l'adresse dont nous allons vérifier le solde. C'est notre adresse, le premier compte dans Anvil.

Ensuite, nous exécutons la méthode JSON-RPC eth_call pour passer l'appel. Notez qu'il n'est pas nécessaire d'envoyer une transaction - ce point d'accès est utilisé pour lire les données des contrats

```$ params='{"from":"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266","to":"0xe7f1725e7734ce288f8367e1bb143e90bb3f0512","data":"0x70a08231000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266"}'

$ curl -X POST -H 'Content-Type: application/json' \
  --data '{"id":1,"jsonrpc":"2.0","method":"eth_call","params":['"$params"',"latest"]}' \
  http://127.0.0.1:8545

{"jsonrpc":"2.0","id":1,"result":"0x00000000000000000000000000000000000000000000011153ce5e56cf880000"}
```

L'adresse "to" est le jeton USDC. Elle est imprimée par le script de déploiement et peut être différente dans votre cas.

Les nœuds Ethereum renvoient les résultats sous forme d'octets bruts. Pour les analyser, nous devons connaître le type de la valeur renvoyée. Dans le cas de la fonction balanceOf, le type de la valeur retournée est uint256. En utilisant cast, nous pouvons la convertir en nombre décimal et ensuite la convertir en éther :

```$ cast --to-dec 0x00000000000000000000000000000000000000000000011153ce5e56cf880000| cast --from-wei
5042.000000000000000000
```

Le solde est correct ! Nous avons frappé 5042 USDC à notre adresse.

### Tick et prix actuels

L'exemple ci-dessus est une démonstration d'appels de contrat de bas niveau. En général, on ne fait jamais d'appels via curl et on utilise un outil ou une bibliothèque qui facilite les choses. Et Cast peut encore nous aider ici !

Obtenons le prix actuel et le tick d'un pool en utilisant cast :

```$ cast call POOL_ADDRESS "slot0()"| xargs cast --abi-decode "a()(uint160,int24)"

5602277097478614198912276234240
85176
```

C'est bien ! La première valeur est la valeur actuelle du √P actuel et la seconde valeur est le tick actuel.

Puisque --abi-decode requiert une signature de fonction complète, nous devons spécifier "a()" même si nous voulons seulement décoder la sortie de la fonction.

### ABI

Pour simplifier l'interaction avec les contrats, le compilateur Solidity peut produire une ABI, Application Binary Interface.

L'ABI est un fichier JSON qui contient la description de toutes les méthodes et événements publics d'un contrat.   L'objectif de ce fichier est de faciliter l'encodage des paramètres des fonctions et le décodage des valeurs de retour. Pour obtenir l'ABI avec Forge, utilisez la commande suivante :

```forge inspect UniswapV3Pool abi```

N'hésitez pas à parcourir le fichier pour mieux comprendre son contenu.

## Interface utilisateur