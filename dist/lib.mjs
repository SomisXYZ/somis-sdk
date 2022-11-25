var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/lib.ts
import { Coin } from "@mysten/sui.js";
import { NftClient } from "@originbyte/js-sdk";
import DataLoader from "dataloader";
import LRUCache from "lru-cache";

// src/parser.ts
var ArtNftRegex = /(0x[a-f0-9]{40})::nft::Nft<0x[a-f0-9]{40}::([a-zA-Z_]{1,})::([a-zA-Z_]{1,}), 0x[a-f0-9]{40}::([a-zA-Z_]{1,}::[a-zA-Z_]{1,})>/;
var CollectionRegex = /(0x[a-f0-9]{40})::collection::Collection<0x[a-f0-9]{40}::([a-zA-Z_]{1,})::([a-zA-Z_]{1,}), 0x[a-f0-9]{40}::std_collection::StdMeta>/;
var parseObjectOwner = /* @__PURE__ */ __name((owner) => {
  let ownerAddress = "";
  if (typeof owner === "object") {
    if ("AddressOwner" in owner) {
      ownerAddress = owner.AddressOwner;
    }
    if ("ObjectOwner" in owner) {
      ownerAddress = owner.ObjectOwner;
    }
  }
  return ownerAddress;
}, "parseObjectOwner");
var ArtNftParser = {
  parser: (data, suiData, _) => {
    if (typeof _.details === "object" && "data" in _.details) {
      const { owner } = _.details;
      const matches = suiData.data.type.match(ArtNftRegex);
      if (!matches) {
        return void 0;
      }
      const packageObjectId = matches[1];
      const packageModule = matches[2];
      const packageModuleClassName = matches[3];
      const nftType = matches == null ? void 0 : matches[4];
      return {
        name: data.data.fields.name,
        collectionId: data.data.fields.collection_id,
        attributes: {},
        url: data.data.fields.url,
        owner,
        ownerAddress: parseObjectOwner(owner),
        type: suiData.data.dataType,
        id: _.details.reference.objectId,
        packageObjectId,
        packageModule,
        packageModuleClassName,
        nftType,
        rawResponse: _
      };
    }
    return void 0;
  },
  regex: ArtNftRegex
};
var CollectionParser = {
  parser: (data, suiData, _) => {
    if (typeof _.details === "object" && "data" in _.details) {
      const matches = suiData.data.type.match(CollectionRegex);
      if (!matches) {
        return void 0;
      }
      const packageObjectId = matches[1];
      const packageModule = matches[2];
      const packageModuleClassName = matches[3];
      return {
        name: data.name,
        description: data.description,
        creators: data.creators,
        symbol: data.symbol,
        receiver: data.receiver,
        mintAuthorityId: data.mint_authority,
        type: suiData.data.dataType,
        id: _.details.reference.objectId,
        tags: [],
        rawResponse: _,
        packageObjectId,
        packageModule,
        packageModuleClassName
      };
    }
    return void 0;
  },
  regex: CollectionRegex
};

// src/lib.ts
export * from "@originbyte/js-sdk";
export * from "@mysten/sui.js";
var SuiNftService = class {
  constructor(provider) {
    this.provider = provider;
    this.nftClient = new NftClient(provider);
    this.collectionDataLoader = new DataLoader(async (collectionIds) => {
      const result = await this.nftClient.fetchAndParseObjectsById(collectionIds, CollectionParser);
      return result;
    }, {
      cacheMap: new LRUCache({
        max: 5e3
      })
    });
    this.nftDataLoader = new DataLoader(async (nftIds) => {
      const result = await this.nftClient.fetchAndParseObjectsById(nftIds, ArtNftParser);
      return nftIds.map((id) => {
        var _a;
        return (_a = result.find((item) => (item == null ? void 0 : item.id) === id)) != null ? _a : null;
      });
    }, {
      cacheMap: new LRUCache({
        max: 5e3
      })
    });
  }
  async getNFTByOwner(address) {
    return await this.nftClient.fetchAndParseObjectsForAddress(address, ArtNftParser);
  }
  async getNFTById(nftId, reload = false) {
    if (reload) {
      return await this.nftDataLoader.clear(nftId).load(nftId);
    } else {
      return await this.nftDataLoader.load(nftId);
    }
  }
  async isNftListed(nftId, marketplaceId) {
    const nft = (await this.provider.getObject(nftId)).details;
    const nftOwner = parseObjectOwner(nft.owner);
    const dynamicField = (await this.provider.getObject(nftOwner)).details;
    const dynamicFieldOwner = parseObjectOwner(dynamicField.owner);
    return dynamicFieldOwner === marketplaceId;
  }
  async getNFTByIds(nftIds) {
    return (await this.nftDataLoader.loadMany(nftIds)).map((nft) => nft instanceof Error ? null : nft);
  }
  async getNFTCollection(collectionId) {
    return await this.collectionDataLoader.load(collectionId);
  }
  async buyFromLaunchpad(wallet, options) {
    var _a;
    const markets = await this.nftClient.getMarketsByParams({
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
      const coins = await this.provider.getCoinBalancesOwnedByAddress(options.buyer);
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
  async claimCertificate(wallet, address, packageObjectId) {
    const certificates = (await this.nftClient.getNftCertificatesForAddress(`0x${address}`)).filter((_) => _.data.packageObjectId === packageObjectId);
    if (certificates.length) {
      const nftForCert = certificates[0].data.nftId;
      const nfts = await this.nftClient.getNftsById({
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
  async listNFT(packageObjectId, marketplaceId, item, price, wallet) {
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
  async buyNFT(packageObjectId, marketplace, listingKey, price, wallet, buyerAddress) {
    const item = await this.getNFTById(listingKey);
    if (item == null) {
      throw new Error("Cannot resolve item");
    }
    const coins = await this.provider.getCoinBalancesOwnedByAddress(buyerAddress);
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
  async cancelListing(packageObjectId, marketplace, listingKey, wallet) {
    const item = await this.getNFTById(listingKey);
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
};
__name(SuiNftService, "SuiNftService");
export {
  SuiNftService
};
