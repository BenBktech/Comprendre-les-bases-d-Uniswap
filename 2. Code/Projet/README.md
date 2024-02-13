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