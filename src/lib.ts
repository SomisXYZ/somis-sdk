import {
    Coin,
    JsonRpcProvider,
    ObjectOwner,
    SignableTransaction,
    SuiMoveObject,
    SuiObject,
    SuiTransactionResponse,
} from '@mysten/sui.js'
import {
    ArtNft,
    ArtNftRpcResponse,
    NftClient,
    NftCollection,
    NftCollectionRpcResponse,
    NftType,
    SuiObjectParser,
} from '@originbyte/js-sdk'
import DataLoader from 'dataloader'
import LRUCache from 'lru-cache'
import { ArtNftParser, CollectionParser, parseObjectOwner } from './parser'

export * from '@originbyte/js-sdk'
export * from '@mysten/sui.js'

export interface Wallet {
    signAndExecuteTransaction(transaction: SignableTransaction): Promise<SuiTransactionResponse>
}
export class SuiNftService {
    nftClient: NftClient
    collectionDataLoader: DataLoader<string, NftCollection | null>
    nftDataLoader: DataLoader<string, ArtNft | null>
    constructor(private readonly provider: JsonRpcProvider) {
        this.nftClient = new NftClient(provider as any)
        this.collectionDataLoader = new DataLoader<string, NftCollection | null>(
            async (collectionIds) => {
                const result = (await this.nftClient.fetchAndParseObjectsById(
                    collectionIds as string[],
                    CollectionParser,
                )) as (NftCollection | null)[]

                return result
            },
            { cacheMap: new LRUCache({ max: 5000 }) },
        )

        this.nftDataLoader = new DataLoader<string, ArtNft | null>(
            async (nftIds) => {
                const result = (await this.nftClient.fetchAndParseObjectsById(
                    nftIds as string[],
                    ArtNftParser,
                )) as (ArtNft | null)[]

                return nftIds.map((id) => result.find((item) => item?.id === id) ?? null)
            },
            { cacheMap: new LRUCache({ max: 5000 }) },
        )
    }

    async getNFTByOwner(address: string): Promise<ArtNft[]> {
        return await this.nftClient.fetchAndParseObjectsForAddress(address, ArtNftParser)
    }

    async getNFTById(nftId: string, reload = false): Promise<ArtNft | null> {
        if (reload) {
            return await this.nftDataLoader.clear(nftId).load(nftId)
        } else {
            return await this.nftDataLoader.load(nftId)
        }
    }

    async isNftListed(nftId: string, marketplaceId: string): Promise<boolean> {
        const nft = (await this.provider.getObject(nftId)).details as SuiObject
        const nftOwner = parseObjectOwner(nft.owner)
        const dynamicField = (await this.provider.getObject(nftOwner)).details as SuiObject
        const dynamicFieldOwner = parseObjectOwner(dynamicField.owner)
        return dynamicFieldOwner === marketplaceId
    }

    async getNFTByIds(nftIds: string[]): Promise<(ArtNft | null)[]> {
        return (await this.nftDataLoader.loadMany(nftIds)).map((nft) => (nft instanceof Error ? null : nft))
    }

    async getNFTCollection(collectionId: string): Promise<NftCollection | null> {
        // this will batch loading the collection
        return await this.collectionDataLoader.load(collectionId)
    }

    async buyFromLaunchpad(wallet: Wallet, options: { launchpadId: string; buyer: string }) {
        const markets = await this.nftClient.getMarketsByParams({ objectIds: [options.launchpadId] })
        if (markets[0]) {
            const market = markets[0]
            if (!market.data.live) {
                throw new Error('Market is not live yet')
            }
            const price = market.data.sales.find((s) => s.nfts.length > 0)?.marketPrice
            if (price == null) {
                throw new Error('Market has no sales')
            }

            const coins = await this.provider.getCoinBalancesOwnedByAddress(options.buyer)
            const coinToBuy: any = coins.find(
                (coin) => (Coin.getBalance(coin)?.valueOf() ?? BigInt(0)) >= BigInt(price),
            )

            if (coinToBuy == null) {
                throw new Error('Fail no coin has enough balance')
            }

            const buyCertificateTransaction = NftClient.buildBuyNftCertificate({
                collectionType: `${market.data.packageObjectId}::${market.data.packageModule}::${market.data.packageModuleClassName}`,
                packageObjectId: market.data.packageObjectId,
                launchpadId: market.data.id,
                wallet: coinToBuy.details.data.fields.id.id, // Coin address to pay for NFT
            })

            await wallet.signAndExecuteTransaction({ kind: 'moveCall', data: buyCertificateTransaction })
        }
    }

    async claimCertificate(wallet: Wallet, address: string, packageObjectId: string) {
        const certificates = (await this.nftClient.getNftCertificatesForAddress(`0x${address}`)).filter(
            (_) => _.data.packageObjectId === packageObjectId,
        )
        if (certificates.length) {
            const nftForCert = certificates[0].data.nftId
            const nfts = await this.nftClient.getNftsById({ objectIds: [nftForCert] })
            if (nfts.length) {
                const nft = nfts[0]
                const claimCertificateTx = NftClient.buildClaimNftCertificate({
                    collectionType: `${nft.data.packageObjectId}::${nft.data.packageModule}::${nft.data.packageModuleClassName}`,
                    packageObjectId: nft.data.packageObjectId,
                    launchpadId: certificates[0].data.launchpadId,
                    nftId: nft.data.id,
                    recepient: `0x${address}`,
                    nftType: nft.data.nftType,
                    certificateId: certificates[0].data.id,
                })
                await wallet.signAndExecuteTransaction({ kind: 'moveCall', data: claimCertificateTx })
            }
        }
    }

    async listNFT(
        packageObjectId: string,
        marketplaceId: string,
        item: ArtNft,
        price: string,
        wallet: Wallet,
    ): Promise<string | undefined> {
        await wallet.signAndExecuteTransaction({
            kind: 'moveCall',
            data: {
                packageObjectId,
                module: 'marketplace',
                function: 'list',
                arguments: [marketplaceId, item.id, parseInt(price)],
                typeArguments: [
                    `${item.packageObjectId}::${item.packageModule}::${item.packageModuleClassName}`,
                    '0x2::sui::SUI',
                ],
                gasBudget: 5000,
            },
        })

        return item.id
    }

    async buyNFT(
        packageObjectId: string,
        marketplace: string,
        listingKey: string,
        price: string,
        wallet: Wallet,
        buyerAddress: string,
    ) {
        const item = await this.getNFTById(listingKey)
        if (item == null) {
            throw new Error('Cannot resolve item')
        }
        const coins = await this.provider.getCoinBalancesOwnedByAddress(buyerAddress)
        const coinToBuy: any = coins.find((coin) => (Coin.getBalance(coin)?.valueOf() ?? BigInt(0)) >= BigInt(price))

        if (coinToBuy == null) {
            throw new Error('Fail no coin has enough balance')
        }

        await wallet.signAndExecuteTransaction({
            kind: 'moveCall',
            data: {
                packageObjectId,
                module: 'marketplace',
                function: 'buy_and_take',
                arguments: [
                    marketplace,
                    item.id,
                    coinToBuy.details.data.fields.id.id,
                    parseInt(price),
                    item.collectionId,
                ], // TODO add coin here
                typeArguments: [
                    `${item.packageObjectId}::${item.packageModule}::${item.packageModuleClassName}`,
                    `${item.packageObjectId}::std_collection::StdMeta`,
                    '0x2::sui::SUI',
                ],
                gasBudget: 5000,
            },
        })
    }

    async cancelListing(packageObjectId: string, marketplace: string, listingKey: string, wallet: Wallet) {
        const item = await this.getNFTById(listingKey)
        if (item == null) {
            throw new Error('Cannot resolve item')
        }
        await wallet.signAndExecuteTransaction({
            kind: 'moveCall',
            data: {
                packageObjectId,
                module: 'marketplace',
                function: 'delist_and_take',
                arguments: [marketplace, item.id],
                typeArguments: [
                    `${item.packageObjectId}::${item.packageModule}::${item.packageModuleClassName}`,
                    `${item.packageObjectId}::${item.nftType}`,
                    '0x2::sui::SUI',
                ],
                gasBudget: 5000,
            },
        })
    }
}
