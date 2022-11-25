var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/lib.ts
import { Coin } from "@mysten/sui.js";
import { ArtNftParser, CollectionParser, NftClient } from "@originbyte/js-sdk";
import DataLoader from "dataloader";
import LRUCache from "lru-cache";
async function getNFTByOwner(address) {
  const nftClient = new NftClient();
  return await nftClient.fetchAndParseObjectsForAddress(address, ArtNftParser);
}
__name(getNFTByOwner, "getNFTByOwner");
async function getNFTById(nftId) {
  return await nftDataLoader.load(nftId);
}
__name(getNFTById, "getNFTById");
async function getNFTCollection(collectionId) {
  return await collectionDataLoader.load(collectionId);
}
__name(getNFTCollection, "getNFTCollection");
var collectionDataLoader = new DataLoader(async (collectionIds) => {
  const nftClient = new NftClient();
  const result = await nftClient.fetchAndParseObjectsById(collectionIds, CollectionParser);
  return result;
}, {
  cacheMap: new LRUCache({
    max: 5e3
  })
});
var nftDataLoader = new DataLoader(async (nftIds) => {
  const nftClient = new NftClient();
  const result = await nftClient.fetchAndParseObjectsById(nftIds, ArtNftParser);
  return nftIds.map((id) => {
    var _a;
    return (_a = result.find((item) => (item == null ? void 0 : item.id) === id)) != null ? _a : null;
  });
}, {
  cacheMap: new LRUCache({
    max: 5e3
  })
});
async function buyFromLaunchpad(provider, wallet, options) {
  var _a;
  const client = new NftClient(provider);
  const markets = await client.getMarketsByParams({
    objectIds: [
      options.launchpadId
    ]
  });
  if (markets[0]) {
    const market = markets[0];
    if (!market.data.live) {
      throw new Error("Market is not live yet");
    }
    const price = (_a = market.data.sales.find((s) => s.nfts.length > 0)) == null ? void 0 : _a.marketPrice;
    if (price == null) {
      throw new Error("Market has no sales");
    }
    const coins = await provider.getCoinBalancesOwnedByAddress(options.buyer);
    const coinToBuy = coins.find((coin) => {
      var _a2, _b;
      return ((_b = (_a2 = Coin.getBalance(coin)) == null ? void 0 : _a2.valueOf()) != null ? _b : BigInt(0)) >= BigInt(price);
    });
    if (coinToBuy == null) {
      throw new Error("Fail no coin has enough balance");
    }
    const buyCertificateTransaction = NftClient.buildBuyNftCertificate({
      collectionType: `${market.data.packageObjectId}::${market.data.packageModule}::${market.data.packageModuleClassName}`,
      packageObjectId: market.data.packageObjectId,
      launchpadId: market.data.id,
      wallet: coinToBuy.details.data.fields.id.id
    });
    await wallet.signAndExecuteTransaction({
      kind: "moveCall",
      data: buyCertificateTransaction
    });
  }
}
__name(buyFromLaunchpad, "buyFromLaunchpad");
async function claimCertificate(provider, wallet, address, packageObjectId) {
  const client = new NftClient(provider);
  const certificates = (await client.getNftCertificatesForAddress(`0x${address}`)).filter((_) => _.data.packageObjectId === packageObjectId);
  if (certificates.length) {
    const nftForCert = certificates[0].data.nftId;
    const nfts = await client.getNftsById({
      objectIds: [
        nftForCert
      ]
    });
    if (nfts.length) {
      const nft = nfts[0];
      const claimCertificateTx = NftClient.buildClaimNftCertificate({
        collectionType: `${nft.data.packageObjectId}::${nft.data.packageModule}::${nft.data.packageModuleClassName}`,
        packageObjectId: nft.data.packageObjectId,
        launchpadId: certificates[0].data.launchpadId,
        nftId: nft.data.id,
        recepient: `0x${address}`,
        nftType: nft.data.nftType,
        certificateId: certificates[0].data.id
      });
      await wallet.signAndExecuteTransaction({
        kind: "moveCall",
        data: claimCertificateTx
      });
    }
  }
}
__name(claimCertificate, "claimCertificate");
async function listNFT(packageObjectId, marketplaceId, item, price, wallet) {
  await wallet.signAndExecuteTransaction({
    kind: "moveCall",
    data: {
      packageObjectId,
      module: "marketplace",
      function: "list",
      arguments: [
        marketplaceId,
        item.id,
        parseInt(price)
      ],
      typeArguments: [
        `${item.packageObjectId}::${item.packageModule}::${item.packageModuleClassName}`,
        "0x2::sui::SUI"
      ],
      gasBudget: 5e3
    }
  });
  return item.id;
}
__name(listNFT, "listNFT");
async function cancelNFT(packageObjectId, marketplace, listingKey, wallet) {
  const item = await getNFTById(listingKey);
  if (item == null) {
    throw new Error("Cannot resolve item");
  }
  await wallet.signAndExecuteTransaction({
    kind: "moveCall",
    data: {
      packageObjectId,
      module: "marketplace",
      function: "delist_and_take",
      arguments: [
        marketplace,
        item.id
      ],
      typeArguments: [
        `${item.packageObjectId}::${item.packageModule}::${item.packageModuleClassName}`,
        `${item.packageObjectId}::${item.nftType}`,
        "0x2::sui::SUI"
      ],
      gasBudget: 5e3
    }
  });
}
__name(cancelNFT, "cancelNFT");
async function buyNFT(provider, packageObjectId, marketplace, listingKey, price, wallet, buyerAddress) {
  const item = await getNFTById(listingKey);
  if (item == null) {
    throw new Error("Cannot resolve item");
  }
  const coins = await provider.getCoinBalancesOwnedByAddress(buyerAddress);
  const coinToBuy = coins.find((coin) => {
    var _a, _b;
    return ((_b = (_a = Coin.getBalance(coin)) == null ? void 0 : _a.valueOf()) != null ? _b : BigInt(0)) >= BigInt(price);
  });
  if (coinToBuy == null) {
    throw new Error("Fail no coin has enough balance");
  }
  await wallet.signAndExecuteTransaction({
    kind: "moveCall",
    data: {
      packageObjectId,
      module: "marketplace",
      function: "buy_and_take",
      arguments: [
        marketplace,
        item.id,
        coinToBuy.details.data.fields.id.id,
        parseInt(price),
        item.collectionId
      ],
      typeArguments: [
        `${item.packageObjectId}::${item.packageModule}::${item.packageModuleClassName}`,
        `${item.packageObjectId}::std_collection::StdMeta`,
        "0x2::sui::SUI"
      ],
      gasBudget: 5e3
    }
  });
}
__name(buyNFT, "buyNFT");
export {
  buyFromLaunchpad,
  buyNFT,
  cancelNFT,
  claimCertificate,
  collectionDataLoader,
  getNFTById,
  getNFTByOwner,
  getNFTCollection,
  listNFT,
  nftDataLoader
};
