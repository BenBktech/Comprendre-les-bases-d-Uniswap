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