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